<script>
        function escapeHtml(str) {
            return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
        }

        // --- TAB SWITCHING ---
        const navItems = document.querySelectorAll('.nav-item');
        const workspaceTabs = document.querySelectorAll('.workspace-tab');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetTab = item.getAttribute('data-tab');
                navItems.forEach(nav => nav.classList.remove('active'));
                workspaceTabs.forEach(tab => tab.classList.remove('active'));
                item.classList.add('active');
                document.getElementById(`tab-${targetTab}`).classList.add('active');

                if (targetTab === 'agent' && agentFitAddon && agentTerm) {
                    agentFitAddon.fit();
                    if (typeof agentWs !== 'undefined' && agentWs && agentWs.readyState === WebSocket.OPEN) {
                        agentWs.send(JSON.stringify({ type: 'resize', cols: agentTerm.cols, rows: agentTerm.rows }));
                    }
                }
                if (targetTab === 'terminal' && terminalFitAddon && terminalTerm) {
                    terminalFitAddon.fit();
                    if (typeof termWs !== 'undefined' && termWs && termWs.readyState === WebSocket.OPEN) {
                        termWs.send(JSON.stringify({ type: 'resize', cols: terminalTerm.cols, rows: terminalTerm.rows }));
                    }
                }
                if (targetTab === 'git') fetchGitStatus();
            });
        });

        // --- MODALS ---
        const projectModal = document.getElementById('projectModal');
        const projectSwitchTrigger = document.getElementById('projectSwitchTrigger');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const currentProjectName = document.getElementById('currentProjectName');
        projectSwitchTrigger.addEventListener('click', () => { fetchProjects(); projectModal.classList.add('active'); });
        closeModalBtn.addEventListener('click', () => projectModal.classList.remove('active'));

        const infoModal = document.getElementById('infoModal');
        const closeInfoModalBtn = document.getElementById('closeInfoModalBtn');
        const infoModalTitle = document.getElementById('infoModalTitle');
        const infoModalContent = document.getElementById('infoModalContent');
        function showInfo(title, message) { infoModalTitle.textContent = title; infoModalContent.textContent = message; infoModal.classList.add('active'); }
        closeInfoModalBtn.addEventListener('click', () => infoModal.classList.remove('active'));

        // --- DYNAMIC FILESYSTEM & PROJECT MANAGEMENT ---
        let currentProject = 'mobile-dev-studio';
        let activeOpenFile = null;
        let activeFileMtime = null;
        let isEditorDirty = false;
        let activeAgentProject = currentProject;

        const projectListEl = document.getElementById('projectList');
        const fileTreeContainer = document.getElementById('fileTreeContainer');
        const codeEditorArea = document.getElementById('codeEditorArea');
        const editorFileName = document.getElementById('editorFileName');
        const editorUnsavedDot = document.getElementById('editorUnsavedDot');
        const btnSaveFile = document.getElementById('btnSaveFile');
        const editorEmptyState = document.getElementById('editorEmptyState');
        const selectedFilePath = document.getElementById('selectedFilePath');
        const selectedFileMeta = document.getElementById('selectedFileMeta');
        const fileSearchInput = document.getElementById('fileSearchInput');

        function checkUnsavedChanges(onConfirm) {
            if (!isEditorDirty) { onConfirm(); return; }
            infoModalTitle.textContent = 'UNSAVED CHANGES';
            infoModalContent.innerHTML = `<div style="margin-bottom: 10px;">"${activeOpenFile || 'File'}" has unsaved changes.</div><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnGuardSave">Save</button><button class="btn-cancel" id="btnGuardDiscard" style="color: var(--red);">Discard</button><button class="btn-cancel" id="btnGuardCancel">Cancel</button></div>`;
            infoModal.classList.add('active');
            document.getElementById('btnGuardSave').onclick = async () => { infoModal.classList.remove('active'); await saveCurrentFile(); onConfirm(); };
            document.getElementById('btnGuardDiscard').onclick = () => { infoModal.classList.remove('active'); isEditorDirty = false; onConfirm(); };
            document.getElementById('btnGuardCancel').onclick = () => { infoModal.classList.remove('active'); };
        }

        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (res.ok) {
                    const projects = await res.json();
                    projectListEl.innerHTML = '';
                    projects.forEach(p => {
                        const item = document.createElement('div');
                        item.className = `project-item ${p.name === currentProject ? 'current' : ''}`;
                        item.setAttribute('data-proj', p.name);
                        item.innerHTML = `<span>${escapeHtml(p.name)}</span>${p.name === currentProject ? '<span>✓</span>' : ''}`;
                        item.onclick = () => { checkUnsavedChanges(() => { currentProject = p.name; currentProjectName.textContent = p.name; fetchProjects(); fetchFileTree(); resetEditorState(); projectModal.classList.remove('active'); }); };
                        projectListEl.appendChild(item);
                    });
                }
            } catch (e) {}
        }

        document.getElementById('btnNewProject').onclick = () => {
            projectModal.classList.remove('active');
            infoModalTitle.textContent = 'CREATE NEW PROJECT';
            infoModalContent.innerHTML = `<div style="margin-bottom: 8px;">Enter new project name:</div><input type="text" id="newProjectNameInput" class="search-input" style="width: 100%; margin-bottom: 12px;" placeholder="e.g. my-app"><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnConfirmCreateProj">Create</button><button class="btn-cancel" id="btnCancelCreateProj">Cancel</button></div>`;
            infoModal.classList.add('active');
            document.getElementById('btnConfirmCreateProj').onclick = async () => { const name = document.getElementById('newProjectNameInput').value.trim(); if (!name) return; try { const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); const data = await res.json(); if (res.ok) { infoModal.classList.remove('active'); currentProject = data.name; currentProjectName.textContent = data.name; fetchProjects(); fetchFileTree(); resetEditorState(); } else { showInfo('ERROR', data.detail || 'Failed'); } } catch (e) { showInfo('ERROR', 'Network error'); } };
            document.getElementById('btnCancelCreateProj').onclick = () => infoModal.classList.remove('active');
        };

        async function fetchFileTree(subPath = '') {
            try {
                const res = await fetch(`/api/fs/tree?project=${encodeURIComponent(currentProject)}&path=${encodeURIComponent(subPath)}`);
                if (res.ok) { renderFileTree(await res.json()); }
                else { fileTreeContainer.innerHTML = `<div style="padding: 12px; color: var(--red);">Failed to load tree</div>`; }
            } catch (e) { fileTreeContainer.innerHTML = `<div style="padding: 12px; color: var(--red);">Network error</div>`; }
        }

        function renderFileTree(items) {
            fileTreeContainer.innerHTML = '';
            if (items.length === 0) { fileTreeContainer.innerHTML = `<div style="padding: 12px; color: var(--text-muted);">(Empty folder)</div>`; return; }
            items.forEach(item => {
                const node = document.createElement('div');
                node.className = `tree-node ${item.is_dir ? 'folder' : 'file'} ${activeOpenFile === item.rel_path ? 'active-file' : ''}`;
                node.setAttribute('data-path', item.rel_path);
                node.innerHTML = `<span class="node-icon">${item.is_dir ? '📁' : '📄'}</span><span>${escapeHtml(item.name)}</span>`;
                node.onclick = () => {
                    document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('active-file'));
                    node.classList.add('active-file');
                    selectedFilePath.textContent = item.rel_path;
                    selectedFileMeta.textContent = item.is_dir ? 'Directory' : `${item.size} bytes`;
                    if (!item.is_dir) openFileInEditor(item.rel_path);
                };
                fileTreeContainer.appendChild(node);
            });
        }

        async function openFileInEditor(relPath) {
            checkUnsavedChanges(async () => {
                try {
                    const res = await fetch(`/api/fs/read?project=${encodeURIComponent(currentProject)}&path=${encodeURIComponent(relPath)}`);
                    const data = await res.json();
                    if (!res.ok) { showInfo('CANNOT OPEN FILE', data.detail || 'Error'); return; }
                    if (data.is_binary) { editorEmptyState.style.display = 'flex'; editorEmptyState.textContent = 'Binary or unsupported file — editor unavailable.'; codeEditorArea.style.display = 'none'; btnSaveFile.style.display = 'none'; editorFileName.textContent = relPath; editorUnsavedDot.style.display = 'none'; activeOpenFile = null; isEditorDirty = false; return; }
                    activeOpenFile = relPath; activeFileMtime = data.mtime; codeEditorArea.value = data.content || ''; editorFileName.textContent = relPath; isEditorDirty = false; editorUnsavedDot.style.display = 'none'; btnSaveFile.style.display = 'inline-block'; codeEditorArea.style.display = 'block'; editorEmptyState.style.display = 'none';
                } catch (e) { showInfo('ERROR', 'Network error opening file'); }
            });
        }

        codeEditorArea.addEventListener('input', () => { if (!isEditorDirty) { isEditorDirty = true; editorUnsavedDot.style.display = 'inline'; } });

        async function saveCurrentFile(force = false) {
            if (!activeOpenFile) return;
            try {
                const res = await fetch('/api/fs/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, path: activeOpenFile, content: codeEditorArea.value, expected_mtime: activeFileMtime, force }) });
                const data = await res.json();
                if (res.status === 409) {
                    infoModalTitle.textContent = 'FILE CHANGED EXTERNALLY';
                    infoModalContent.innerHTML = `<div style="margin-bottom: 10px;">"${activeOpenFile}" was modified outside the editor.</div><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnOverwriteSave">Overwrite</button><button class="btn-cancel" id="btnReloadDisk">Reload from Disk</button></div>`;
                    infoModal.classList.add('active');
                    document.getElementById('btnOverwriteSave').onclick = async () => { infoModal.classList.remove('active'); await saveCurrentFile(true); };
                    document.getElementById('btnReloadDisk').onclick = async () => { infoModal.classList.remove('active'); isEditorDirty = false; await openFileInEditor(activeOpenFile); };
                    return;
                }
                if (res.ok) { activeFileMtime = data.mtime; isEditorDirty = false; editorUnsavedDot.style.display = 'none'; fetchFileTree(); }
                else { showInfo('SAVE ERROR', data.detail || 'Failed'); }
            } catch (e) { showInfo('SAVE ERROR', 'Network error'); }
        }
        btnSaveFile.onclick = () => saveCurrentFile();

        function resetEditorState() { activeOpenFile = null; activeFileMtime = null; isEditorDirty = false; editorFileName.textContent = 'No file open'; editorUnsavedDot.style.display = 'none'; btnSaveFile.style.display = 'none'; codeEditorArea.style.display = 'none'; editorEmptyState.style.display = 'flex'; editorEmptyState.textContent = 'Select a file to view or edit'; selectedFilePath.textContent = 'None'; selectedFileMeta.textContent = '0 bytes'; }

        fileSearchInput.addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); document.querySelectorAll('.tree-node').forEach(n => { n.style.display = (!q || n.textContent.toLowerCase().includes(q)) ? 'flex' : 'none'; }); });

        document.getElementById('btnNewFile').onclick = () => { infoModalTitle.textContent = 'CREATE NEW FILE'; infoModalContent.innerHTML = `<div style="margin-bottom: 8px;">Relative path (e.g. app/utils.py):</div><input type="text" id="newFileInput" class="search-input" style="width: 100%; margin-bottom: 12px;" placeholder="path/filename.py"><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnConfirmCreateFile">Create</button><button class="btn-cancel" id="btnCancelCreateFile">Cancel</button></div>`; infoModal.classList.add('active'); document.getElementById('btnConfirmCreateFile').onclick = async () => { const p = document.getElementById('newFileInput').value.trim(); if (!p) return; try { const r = await fetch('/api/fs/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, path: p, type: 'file' }) }); const d = await r.json(); if (r.ok) { infoModal.classList.remove('active'); fetchFileTree(); openFileInEditor(p); } else { showInfo('ERROR', d.detail || 'Failed'); } } catch (e) { showInfo('ERROR', 'Network error'); } }; document.getElementById('btnCancelCreateFile').onclick = () => infoModal.classList.remove('active'); };

        document.getElementById('btnNewFolder').onclick = () => { infoModalTitle.textContent = 'CREATE NEW FOLDER'; infoModalContent.innerHTML = `<div style="margin-bottom: 8px;">Relative folder path:</div><input type="text" id="newFolderInput" class="search-input" style="width: 100%; margin-bottom: 12px;" placeholder="folder_name"><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnConfirmCreateFolder">Create</button><button class="btn-cancel" id="btnCancelCreateFolder">Cancel</button></div>`; infoModal.classList.add('active'); document.getElementById('btnConfirmCreateFolder').onclick = async () => { const p = document.getElementById('newFolderInput').value.trim(); if (!p) return; try { const r = await fetch('/api/fs/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, path: p, type: 'dir' }) }); const d = await r.json(); if (r.ok) { infoModal.classList.remove('active'); fetchFileTree(); } else { showInfo('ERROR', d.detail || 'Failed'); } } catch (e) { showInfo('ERROR', 'Network error'); } }; document.getElementById('btnCancelCreateFolder').onclick = () => infoModal.classList.remove('active'); };

        document.getElementById('btnRenameItem').onclick = () => { const t = selectedFilePath.textContent; if (!t || t === 'None') { showInfo('RENAME', 'Select a file or folder first.'); return; } infoModalTitle.textContent = 'RENAME'; infoModalContent.innerHTML = `<div style="margin-bottom: 8px;">Rename "${escapeHtml(t)}" to:</div><input type="text" id="renameInput" class="search-input" style="width: 100%; margin-bottom: 12px;" value="${escapeHtml(t)}"><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnConfirmRename">Rename</button><button class="btn-cancel" id="btnCancelRename">Cancel</button></div>`; infoModal.classList.add('active'); document.getElementById('btnConfirmRename').onclick = async () => { const np = document.getElementById('renameInput').value.trim(); if (!np || np === t) return; try { const r = await fetch('/api/fs/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, old_path: t, new_path: np }) }); const d = await r.json(); if (r.ok) { infoModal.classList.remove('active'); if (activeOpenFile === t) { activeOpenFile = np; editorFileName.textContent = np; } fetchFileTree(); } else { showInfo('ERROR', d.detail || 'Failed'); } } catch (e) { showInfo('ERROR', 'Network error'); } }; document.getElementById('btnCancelRename').onclick = () => infoModal.classList.remove('active'); };

        document.getElementById('btnDeleteItem').onclick = () => { const t = selectedFilePath.textContent; if (!t || t === 'None') { showInfo('DELETE', 'Select a file or folder first.'); return; } infoModalTitle.textContent = 'CONFIRM DELETION'; infoModalContent.innerHTML = `<div style="margin-bottom: 12px;">Are you sure you want to delete "${escapeHtml(t)}"?</div><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnConfirmDelete" style="background: var(--red); color: #fff;">Delete</button><button class="btn-cancel" id="btnCancelDelete">Cancel</button></div>`; infoModal.classList.add('active'); document.getElementById('btnConfirmDelete').onclick = async () => { try { const r = await fetch('/api/fs/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, path: t }) }); const d = await r.json(); if (r.ok) { infoModal.classList.remove('active'); if (activeOpenFile === t) resetEditorState(); fetchFileTree(); } else { showInfo('ERROR', d.detail || 'Failed'); } } catch (e) { showInfo('ERROR', 'Network error'); } }; document.getElementById('btnCancelDelete').onclick = () => infoModal.classList.remove('active'); };

        document.getElementById('btnRefreshFiles').onclick = () => fetchFileTree();
        fetchProjects(); fetchFileTree();

        // --- XTERM.JS TERMINAL INTEGRATIONS ---
        const termTheme = { background: '#060708', foreground: '#c9d1d9', cursor: '#c9d1d9', selectionBackground: 'rgba(56,189,248,0.25)', black: '#0b0c0e', red: '#ef4444', green: '#10b981', yellow: '#f59e0b', blue: '#38bdf8', magenta: '#a78bfa', cyan: '#22d3ee', white: '#e1e4e8' };

        let agentTerm, agentFitAddon, agentWs;
        let terminalTerm, terminalFitAddon, termWs;

        function updateAgentStatus(status, type) {
            const b = document.getElementById('agentStatusBadge');
            b.textContent = status;
            if (type === 'connected') { b.className = 'status-badge'; b.style.color = 'var(--accent)'; b.style.borderColor = 'var(--accent-border)'; b.style.background = 'var(--accent-dim)'; }
            else if (type === 'working') { b.className = 'status-badge working'; b.style.color = 'var(--blue)'; b.style.borderColor = 'rgba(56,189,248,0.3)'; b.style.background = 'var(--blue-dim)'; }
            else { b.className = 'status-badge'; b.style.color = 'var(--red)'; b.style.borderColor = 'rgba(239,68,68,0.3)'; b.style.background = 'var(--red-dim)'; }
        }

        function updateTerminalStatus(status, type) {
            const b = document.getElementById('terminalStatusBadge');
            b.textContent = status;
            if (type === 'connected') { b.className = 'status-badge'; b.style.color = 'var(--accent)'; b.style.borderColor = 'var(--accent-border)'; b.style.background = 'var(--accent-dim)'; }
            else if (type === 'working') { b.className = 'status-badge working'; b.style.color = 'var(--blue)'; b.style.borderColor = 'rgba(56,189,248,0.3)'; b.style.background = 'var(--blue-dim)'; }
            else { b.className = 'status-badge'; b.style.color = 'var(--red)'; b.style.borderColor = 'rgba(239,68,68,0.3)'; b.style.background = 'var(--red-dim)'; }
        }

        let agentIsScrolledUp = false;
        function initAgentTerm() {
            if (agentTerm) return;
            const container = document.getElementById('agentStream');
            container.innerHTML = '';
            agentTerm = new Terminal({ theme: termTheme, fontFamily: "'Fira Code', monospace", fontSize: 13, lineHeight: 1.2, letterSpacing: 0, cursorBlink: true, convertEol: true, scrollback: 10000, disableStdin: true });
            agentFitAddon = new FitAddon.FitAddon();
            agentTerm.loadAddon(agentFitAddon);
            agentTerm.open(container);
            
            const btnScroll = document.getElementById('agentScrollBottomBtn');
            btnScroll.addEventListener('click', () => {
                agentTerm.scrollToBottom();
                btnScroll.style.display = 'none';
                agentIsScrolledUp = false;
            });

            agentTerm.onScroll((ydisp) => {
                agentIsScrolledUp = ydisp < agentTerm.buffer.active.baseY;
                if (!agentIsScrolledUp) btnScroll.style.display = 'none';
            });

            try {
                const webglAddon = new WebglAddon.WebglAddon();
                webglAddon.onContextLoss(() => webglAddon.dispose());
                agentTerm.loadAddon(webglAddon);
            } catch (e) {
                console.warn('WebGL addon could not load', e);
            }
            agentFitAddon.fit();
            agentTerm.onData((data) => { if (agentWs && agentWs.readyState === WebSocket.OPEN) agentWs.send(JSON.stringify({ type: 'input', data })); });
            agentTerm.onRender(() => {
                if (agentIsScrolledUp) document.getElementById('agentScrollBottomBtn').style.display = 'block';
            });
        }

        let activeAgentType = 'antigravity';

        function initAgentWebSocket(agent = activeAgentType, project = currentProject) {
            initAgentTerm();
            if (agentWs) agentWs.close();
            activeAgentType = agent; activeAgentProject = project;
            updateAgentStatus('CONNECTING', 'working');
            agentTerm.clear();
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${location.host}/ws/agent?agent=${encodeURIComponent(agent)}&project=${encodeURIComponent(project)}`;
            try { agentWs = new WebSocket(wsUrl); } catch (e) { updateAgentStatus('ERROR', 'error'); agentTerm.writeln(`\r\n[ERROR] Failed to connect.`); return; }
            agentWs.onopen = () => { updateAgentStatus('READY', 'connected'); agentFitAddon.fit(); if (agentWs.readyState === WebSocket.OPEN) agentWs.send(JSON.stringify({ type: 'resize', cols: agentTerm.cols, rows: agentTerm.rows })); };
            agentWs.onmessage = (event) => { try { const parsed = JSON.parse(event.data); if (parsed.type === 'error') { updateAgentStatus('ERROR', 'error'); agentTerm.writeln(`\r\n[ERROR] ${parsed.message}`); return; } } catch (e) {} agentTerm.write(event.data); };
            agentWs.onclose = () => { updateAgentStatus('DISCONNECTED', 'error'); };
            agentWs.onerror = () => { updateAgentStatus('ERROR', 'error'); };
        }

        const agentSelector = document.getElementById('agentSelector');
        agentSelector.addEventListener('change', (e) => {
            const nextAgent = e.target.value;
            if (agentWs && agentWs.readyState === WebSocket.OPEN) {
                const currentName = activeAgentType === 'antigravity' ? 'Antigravity' : 'OpenCode';
                const nextName = nextAgent === 'antigravity' ? 'Antigravity' : 'OpenCode';
                infoModalTitle.textContent = 'SWITCH AGENT SESSION';
                infoModalContent.innerHTML = `<div style="margin-bottom: 10px;">${currentName} is currently running.</div><div style="margin-bottom: 12px;">Switching to ${nextName} will terminate the current session.</div><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnConfirmSwitchAgent">Switch</button><button class="btn-cancel" id="btnCancelSwitchAgent">Cancel</button></div>`;
                infoModal.classList.add('active');
                document.getElementById('btnConfirmSwitchAgent').onclick = () => { infoModal.classList.remove('active'); initAgentWebSocket(nextAgent, currentProject); };
                document.getElementById('btnCancelSwitchAgent').onclick = () => { infoModal.classList.remove('active'); agentSelector.value = activeAgentType; };
            } else { initAgentWebSocket(nextAgent, currentProject); }
        });

        function sendAgentInput(str) { if (agentWs && agentWs.readyState === WebSocket.OPEN) agentWs.send(JSON.stringify({ type: 'input', data: str })); else showInfo('AGENT', 'Agent session disconnected. Click Start or Reconnect.'); }

        const agentTextarea = document.getElementById('agentInput');
        const agentSendBtn = document.getElementById('agentSendBtn');
        const btnSummonKeyboard = document.getElementById('btnSummonKeyboard');
        
        btnSummonKeyboard.addEventListener('click', () => {
            agentTextarea.focus();
        });

        let isCtrlActive = false;
        let isAltActive = false;
        const btnCtrl = document.getElementById('btnAgentCtrl');
        const btnAlt = document.getElementById('btnAgentAlt');

        function updateModifierUI() {
            btnCtrl.style.background = isCtrlActive ? 'var(--blue)' : 'var(--bg-root)';
            btnCtrl.style.color = isCtrlActive ? '#000' : 'var(--text-main)';
            btnAlt.style.background = isAltActive ? 'var(--blue)' : 'var(--bg-root)';
            btnAlt.style.color = isAltActive ? '#000' : 'var(--text-main)';
        }

        btnCtrl.addEventListener('click', () => { isCtrlActive = !isCtrlActive; updateModifierUI(); });
        btnAlt.addEventListener('click', () => { isAltActive = !isAltActive; updateModifierUI(); });

        function resetModifiers() {
            isCtrlActive = false;
            isAltActive = false;
            updateModifierUI();
        }

        function getArrowSeq(base) {
            if (isCtrlActive) return `\x1B[1;5${base}`;
            if (isAltActive) return `\x1B[1;3${base}`;
            return `\x1B[${base}`;
        }

        function processAndSendAgentText(text) {
            if (isCtrlActive && text.length === 1) {
                const charCode = text.toUpperCase().charCodeAt(0);
                if (charCode >= 64 && charCode <= 95) {
                    sendAgentInput(String.fromCharCode(charCode - 64));
                }
            } else if (isAltActive && text.length === 1) {
                sendAgentInput('\x1B' + text);
            } else {
                sendAgentInput(text);
            }
            resetModifiers();
        }

        agentTextarea.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                processAndSendAgentText(agentTextarea.value + '\r'); 
                agentTextarea.value = ''; 
                agentTextarea.style.height = '42px'; 
            } 
        });
        
        agentSendBtn.addEventListener('click', () => { 
            processAndSendAgentText(agentTextarea.value + '\r'); 
            agentTextarea.value = ''; 
            agentTextarea.style.height = '42px'; 
        });

        document.getElementById('btnAgentUp').addEventListener('click', () => { sendAgentInput(getArrowSeq('A')); resetModifiers(); });
        document.getElementById('btnAgentDown').addEventListener('click', () => { sendAgentInput(getArrowSeq('B')); resetModifiers(); });
        document.getElementById('btnAgentRight').addEventListener('click', () => { sendAgentInput(getArrowSeq('C')); resetModifiers(); });
        document.getElementById('btnAgentLeft').addEventListener('click', () => { sendAgentInput(getArrowSeq('D')); resetModifiers(); });
        
        document.getElementById('btnAgentEsc').addEventListener('click', () => { sendAgentInput('\x1B'); resetModifiers(); });
        document.getElementById('btnAgentHome').addEventListener('click', () => { sendAgentInput('\x1B[H'); resetModifiers(); });
        document.getElementById('btnAgentEnd').addEventListener('click', () => { sendAgentInput('\x1B[F'); resetModifiers(); });
        document.getElementById('btnAgentPgUp').addEventListener('click', () => { sendAgentInput('\x1B[5~'); resetModifiers(); });
        document.getElementById('btnAgentPgDn').addEventListener('click', () => { sendAgentInput('\x1B[6~'); resetModifiers(); });
        
        document.getElementById('btnAgentEnter').addEventListener('click', () => { sendAgentInput('\r'); resetModifiers(); });
        document.getElementById('btnAgentCtrlC').addEventListener('click', () => { sendAgentInput('\x03'); resetModifiers(); });
        document.getElementById('btnAgentStart').addEventListener('click', () => initAgentWebSocket(agentSelector.value, currentProject));

        // --- V0.7 AGENT ACTIVITY & PERMISSIONS ---
        const permissionSelector = document.getElementById('permissionSelector');
        const permissionHint = document.getElementById('permissionHint');
        const activityLog = document.getElementById('activityLog');
        const approvalModal = document.getElementById('approvalModal');
        let activityWs = null;
        
        function updatePermissionHint(profile) {
            if (profile === 'safe') permissionHint.textContent = 'Safe: All modifications require approval';
            else if (profile === 'normal') permissionHint.textContent = 'Normal: Destructive actions require approval';
            else if (profile === 'full') permissionHint.textContent = 'Full: Operations allowed (out-of-bounds blocked)';
        }
        
        permissionSelector.addEventListener('change', async (e) => {
            const profile = e.target.value;
            updatePermissionHint(profile);
            try {
                await fetch('/api/agent/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profile, project: currentProject })
                });
                addActivityLog('System', `Permission profile set to: ${profile.toUpperCase()}`, 'Success');
            } catch (err) {}
        });
        
        function addActivityLog(action, detail, status) {
            const emptyState = document.getElementById('activityEmptyState');
            if (emptyState) emptyState.style.display = 'none';

            const entry = document.createElement('div');
            entry.style.display = 'flex';
            entry.style.gap = '8px';
            entry.style.padding = '2px 4px';
            
            let statusColor = 'var(--text-muted)';
            if (status === 'Approved' || status === 'Success' || status === 'Auto-approved (Session)') statusColor = 'var(--accent)';
            else if (status === 'Rejected' || status === 'Failed') statusColor = 'var(--red)';
            else if (status === 'Running') statusColor = 'var(--blue)';
            
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            entry.innerHTML = `
                <span style="color: var(--text-muted); width: 65px; flex-shrink: 0;">${time}</span>
                <span style="font-weight: 600; width: 60px; flex-shrink: 0; color: var(--text-main);">${escapeHtml(action)}</span>
                <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-dim);">${escapeHtml(detail)}</span>
                <span style="color: ${statusColor}; width: 80px; text-align: right; flex-shrink: 0;">${escapeHtml(status)}</span>
            `;
            activityLog.appendChild(entry);
            activityLog.scrollTop = activityLog.scrollHeight;
        }

        function initActivityWebSocket() {
            if (activityWs) activityWs.close();
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            activityWs = new WebSocket(`${protocol}//${location.host}/ws/agent_activity`);
            activityWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'activity') {
                        addActivityLog(data.action, data.detail, data.status);
                    } else if (data.type === 'approval_needed') {
                        showApprovalModal(data);
                    }
                } catch (e) {}
            };
            // Initial sync
            updatePermissionHint(permissionSelector.value);
            fetch('/api/agent/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: permissionSelector.value, project: currentProject })
            });
        }

        function showApprovalModal(data) {
            document.getElementById('approvalTitle').textContent = data.reason || 'ACTION REQUIRES APPROVAL';
            document.getElementById('approvalCwd').textContent = data.cwd || currentProject;
            document.getElementById('approvalCommand').textContent = data.command;
            document.getElementById('approvalRisk').textContent = data.risk || 'Unknown';
            
            const btnSession = document.getElementById('btnApproveSession');
            if (data.can_session_approve) {
                btnSession.style.display = 'block';
            } else {
                btnSession.style.display = 'none';
            }
            
            approvalModal.classList.add('active');
            
            const resolve = async (approved, save_session) => {
                approvalModal.classList.remove('active');
                try {
                    await fetch('/api/agent/approve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ req_id: data.req_id, approved, save_session })
                    });
                } catch (e) {}
            };
            
            document.getElementById('btnApproveReject').onclick = () => resolve(false, false);
            document.getElementById('btnApproveOnce').onclick = () => resolve(true, false);
            btnSession.onclick = () => resolve(true, true);
        }
        
        // Start activity websocket on load
        initActivityWebSocket();

        document.getElementById('btnAgentReconnect').addEventListener('click', () => initAgentWebSocket(agentSelector.value, currentProject));
        document.getElementById('btnAgentStop').addEventListener('click', () => { if (agentWs && agentWs.readyState === WebSocket.OPEN) { agentWs.send(JSON.stringify({ type: 'stop' })); agentWs.close(); } updateAgentStatus('STOPPED', 'error'); });

        // --- TERMINAL XTERM ---
        function initTerminalTerm() {
            if (terminalTerm) return;
            const container = document.getElementById('terminalViewport');
            container.innerHTML = '';
            terminalTerm = new Terminal({ theme: termTheme, fontFamily: "'Fira Code', monospace", fontSize: 13, lineHeight: 1.2, letterSpacing: 0, cursorBlink: true, convertEol: true, scrollback: 10000 });
            terminalFitAddon = new FitAddon.FitAddon();
            terminalTerm.loadAddon(terminalFitAddon);
            terminalTerm.open(container);
            try {
                const webglAddon = new WebglAddon.WebglAddon();
                webglAddon.onContextLoss(() => webglAddon.dispose());
                terminalTerm.loadAddon(webglAddon);
            } catch (e) {
                console.warn('WebGL addon could not load', e);
            }
            terminalFitAddon.fit();
            terminalTerm.onData((data) => { if (termWs && termWs.readyState === WebSocket.OPEN) termWs.send(JSON.stringify({ type: 'input', data })); });
        }

        function initTerminalWebSocket() {
            initTerminalTerm();
            if (termWs) termWs.close();
            updateTerminalStatus('CONNECTING', 'working');
            terminalTerm.clear();
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${location.host}/ws/terminal`;
            try { termWs = new WebSocket(wsUrl); } catch (e) { updateTerminalStatus('ERROR', 'error'); terminalTerm.writeln('\r\n[ERROR] Failed to create WebSocket.'); return; }
            termWs.onopen = () => { updateTerminalStatus('CONNECTED', 'connected'); terminalFitAddon.fit(); if (termWs.readyState === WebSocket.OPEN) termWs.send(JSON.stringify({ type: 'resize', cols: terminalTerm.cols, rows: terminalTerm.rows })); };
            termWs.onmessage = (event) => { terminalTerm.write(event.data); };
            termWs.onclose = () => { updateTerminalStatus('DISCONNECTED', 'error'); };
            termWs.onerror = () => { updateTerminalStatus('ERROR', 'error'); };
        }

        function sendTerminalInput(str) { if (termWs && termWs.readyState === WebSocket.OPEN) termWs.send(JSON.stringify({ type: 'input', data: str })); else showInfo('TERMINAL', 'Terminal disconnected. Click Reconnect.'); }

        const terminalInput = document.getElementById('terminalInput');
        terminalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { sendTerminalInput(terminalInput.value + '\n'); terminalInput.value = ''; } else if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); sendTerminalInput('\x03'); } });
        document.getElementById('btnCtrlC').addEventListener('click', () => sendTerminalInput('\x03'));
        document.getElementById('btnTerminalClear').addEventListener('click', () => terminalTerm && terminalTerm.clear());
        document.getElementById('btnTerminalStop').addEventListener('click', () => { if (termWs && termWs.readyState === WebSocket.OPEN) { termWs.send(JSON.stringify({ type: 'stop' })); termWs.close(); } updateTerminalStatus('STOPPED', 'error'); });
        document.getElementById('btnTerminalReconnect').addEventListener('click', () => initTerminalWebSocket());

        const fitTerminals = () => {
            if (agentFitAddon && agentTerm) { agentFitAddon.fit(); if (typeof agentWs !== 'undefined' && agentWs && agentWs.readyState === WebSocket.OPEN) agentWs.send(JSON.stringify({ type: 'resize', cols: agentTerm.cols, rows: agentTerm.rows })); }
            if (terminalFitAddon && terminalTerm) { terminalFitAddon.fit(); if (typeof termWs !== 'undefined' && termWs && termWs.readyState === WebSocket.OPEN) termWs.send(JSON.stringify({ type: 'resize', cols: terminalTerm.cols, rows: terminalTerm.rows })); }
        };
        window.addEventListener('resize', fitTerminals);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                document.documentElement.style.setProperty('--viewport-height', `${window.visualViewport.height}px`);
                fitTerminals();
            });
            document.documentElement.style.setProperty('--viewport-height', `${window.visualViewport.height}px`);
        }
        if (document.fonts) {
            document.fonts.ready.then(() => {
                if (agentTerm) agentTerm.options.fontFamily = "'Fira Code', monospace";
                if (terminalTerm) terminalTerm.options.fontFamily = "'Fira Code', monospace";
                fitTerminals();
            });
        }

        initTerminalWebSocket();

        // --- GIT WORKSPACE LOGIC ---
        let gitSelectedFile = null;

        async function fetchGitStatus() {
            const changesList = document.getElementById('gitChangesList');
            const branchTag = document.getElementById('gitBranchTag');
            try {
                const res = await fetch(`/api/git/status?project=${encodeURIComponent(currentProject)}`);
                const data = await res.json();
                if (!data.is_repo) {
                    branchTag.textContent = '—';
                    changesList.innerHTML = `<div class="empty-state"><div>NOT A GIT REPOSITORY</div><div style="margin-top: 8px;">This project is not managed by Git.</div><button class="btn-approve" id="btnGitInit" style="margin-top: 12px;">Initialize Repository</button></div>`;
                    document.getElementById('btnGitInit').onclick = async () => {
                        try { const r = await fetch('/api/git/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject }) }); if (r.ok) fetchGitStatus(); else { const d = await r.json(); showInfo('ERROR', d.detail || 'Failed'); } } catch (e) { showInfo('ERROR', 'Network error'); }
                    };
                    return;
                }
                branchTag.textContent = data.branch || '—';
                changesList.innerHTML = '';

                function renderSection(label, items, statusChar, actions) {
                    if (items.length === 0) return;
                    const lbl = document.createElement('div');
                    lbl.className = 'git-section-label';
                    lbl.textContent = `${label} (${items.length})`;
                    changesList.appendChild(lbl);
                    items.forEach(item => {
                        const row = document.createElement('div');
                        row.className = 'git-change-row';
                        row.setAttribute('data-path', item.path);
                        const sc = statusChar || item.index || item.worktree || '?';
                        row.innerHTML = `<span class="git-status ${sc}">${sc}</span><span style="flex: 1;">${escapeHtml(item.path)}</span>${actions}`;
                        row.querySelector('.git-status')?.parentElement && row.addEventListener('click', () => {
                            gitSelectedFile = item.path;
                            document.querySelectorAll('.git-change-row').forEach(r => r.classList.remove('selected'));
                            row.classList.add('selected');
                        });
                        // Attach action handlers
                        changesList.appendChild(row);
                        const stageBtn = row.querySelector('.btn-git-stage');
                        const unstageBtn = row.querySelector('.btn-git-unstage');
                        const discardBtn = row.querySelector('.btn-git-discard');
                        const diffBtn = row.querySelector('.btn-git-diff');
                        if (stageBtn) stageBtn.onclick = async (e) => { e.stopPropagation(); try { await fetch('/api/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, path: item.path }) }); fetchGitStatus(); } catch (e) {} };
                        if (unstageBtn) unstageBtn.onclick = async (e) => { e.stopPropagation(); try { await fetch('/api/git/unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, path: item.path }) }); fetchGitStatus(); } catch (e) {} };
                        if (discardBtn) discardBtn.onclick = (e) => { e.stopPropagation(); infoModalTitle.textContent = 'DISCARD CHANGES'; infoModalContent.innerHTML = `<div style="margin-bottom: 12px;">Permanently discard uncommitted changes to "${escapeHtml(item.path)}"?</div><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnConfirmDiscard" style="background: var(--red); color: #fff;">Discard</button><button class="btn-cancel" id="btnCancelDiscard">Cancel</button></div>`; infoModal.classList.add('active'); document.getElementById('btnConfirmDiscard').onclick = async () => { infoModal.classList.remove('active'); try { await fetch('/api/git/discard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, path: item.path }) }); fetchGitStatus(); } catch (e) {} }; document.getElementById('btnCancelDiscard').onclick = () => infoModal.classList.remove('active'); };
                        if (diffBtn) diffBtn.onclick = async (e) => { e.stopPropagation(); try { const staged = label === 'STAGED'; const r = await fetch(`/api/git/diff?project=${encodeURIComponent(currentProject)}&path=${encodeURIComponent(item.path)}&staged=${staged}`); const d = await r.json(); showDiffModal(item.path, d.diff || '(no diff available)'); } catch (e) {} };
                    });
                }

                const stageActions = `<button class="btn-sm btn-git-unstage" style="font-size: 0.65rem; padding: 2px 5px;">Unstage</button><button class="btn-sm btn-git-diff" style="font-size: 0.65rem; padding: 2px 5px;">Diff</button>`;
                const unstageActions = `<button class="btn-sm btn-git-stage" style="font-size: 0.65rem; padding: 2px 5px;">Stage</button><button class="btn-sm btn-git-discard" style="font-size: 0.65rem; padding: 2px 5px; color: var(--red);">Discard</button><button class="btn-sm btn-git-diff" style="font-size: 0.65rem; padding: 2px 5px;">Diff</button>`;
                const untrackedActions = `<button class="btn-sm btn-git-stage" style="font-size: 0.65rem; padding: 2px 5px;">Stage</button>`;
                const conflictActions = `<button class="btn-sm btn-git-stage" style="font-size: 0.65rem; padding: 2px 5px;">Stage</button>`;

                if (data.conflicted.length > 0) renderSection('CONFLICTS', data.conflicted, 'U', conflictActions);
                renderSection('STAGED', data.staged, null, stageActions);
                renderSection('UNSTAGED', data.unstaged, null, unstageActions);
                renderSection('UNTRACKED', data.untracked, '?', untrackedActions);

                if (data.staged.length === 0 && data.unstaged.length === 0 && data.untracked.length === 0 && data.conflicted.length === 0) {
                    changesList.innerHTML = `<div class="empty-state">Working tree clean ✓</div>`;
                }
            } catch (e) {
                changesList.innerHTML = `<div class="empty-state" style="color: var(--red);">Failed to load Git status</div>`;
            }
        }

        function showDiffModal(path, diffText) {
            infoModalTitle.textContent = `DIFF: ${path}`;
            let html = '<div class="diff-container">';
            diffText.split('\n').forEach(line => {
                const escaped = escapeHtml(line);
                if (line.startsWith('+') && !line.startsWith('+++')) html += `<div class="diff-add">${escaped}</div>`;
                else if (line.startsWith('-') && !line.startsWith('---')) html += `<div class="diff-del">${escaped}</div>`;
                else if (line.startsWith('@@')) html += `<div class="diff-hunk">${escaped}</div>`;
                else html += `<div class="diff-ctx">${escaped}</div>`;
            });
            html += '</div>';
            infoModalContent.innerHTML = html;
            infoModal.classList.add('active');
        }

        // Git Commit
        document.getElementById('btnGitCommit').onclick = async () => {
            const msg = document.getElementById('gitCommitInput').value.trim();
            if (!msg) { showInfo('COMMIT', 'Please enter a commit message.'); return; }
            try {
                const r = await fetch('/api/git/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, message: msg }) });
                const d = await r.json();
                if (r.ok) { document.getElementById('gitCommitInput').value = ''; showInfo('COMMITTED', `${d.short_hash || ''} ${d.message || msg}`); fetchGitStatus(); }
                else { showInfo('COMMIT ERROR', d.detail || 'Failed'); }
            } catch (e) { showInfo('ERROR', 'Network error'); }
        };

        // Stage All
        document.getElementById('btnGitStageAll').onclick = async () => { try { await fetch('/api/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, all: true }) }); fetchGitStatus(); } catch (e) {} };

        // Refresh
        document.getElementById('btnGitRefresh').onclick = () => fetchGitStatus();

        // Branches
        document.getElementById('btnGitBranches').onclick = async () => {
            try {
                const r = await fetch(`/api/git/branches?project=${encodeURIComponent(currentProject)}`);
                const branches = await r.json();
                infoModalTitle.textContent = 'BRANCHES';
                let html = '<div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">';
                branches.forEach(b => {
                    html += `<div class="project-item ${b.current ? 'current' : ''}" data-branch="${escapeHtml(b.name)}"><span>${escapeHtml(b.name)}</span>${b.current ? '<span>✓</span>' : '<button class="btn-sm btn-switch-branch" data-bname="' + escapeHtml(b.name) + '" style="font-size: 0.65rem; padding: 2px 5px;">Switch</button>'}</div>`;
                });
                html += `</div><div style="display: flex; gap: 8px;"><input type="text" id="newBranchInput" class="search-input" style="flex: 1;" placeholder="New branch name"><button class="btn-approve" id="btnCreateBranch">Create</button></div>`;
                infoModalContent.innerHTML = html;
                infoModal.classList.add('active');
                // Switch handlers
                document.querySelectorAll('.btn-switch-branch').forEach(btn => {
                    btn.onclick = async (e) => { e.stopPropagation(); const bn = btn.getAttribute('data-bname'); try { const sr = await fetch('/api/git/branch/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, name: bn }) }); const sd = await sr.json(); if (sr.ok) { infoModal.classList.remove('active'); fetchGitStatus(); } else { showInfo('SWITCH ERROR', sd.detail || 'Failed'); } } catch (e) { showInfo('ERROR', 'Network error'); } };
                });
                document.getElementById('btnCreateBranch').onclick = async () => { const bn = document.getElementById('newBranchInput').value.trim(); if (!bn) return; try { const cr = await fetch('/api/git/branch/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject, name: bn }) }); const cd = await cr.json(); if (cr.ok) { infoModal.classList.remove('active'); showInfo('BRANCH CREATED', `Created branch: ${bn}`); fetchGitStatus(); } else { showInfo('ERROR', cd.detail || 'Failed'); } } catch (e) { showInfo('ERROR', 'Network error'); } };
            } catch (e) { showInfo('ERROR', 'Failed to fetch branches'); }
        };

        // History
        document.getElementById('btnGitHistory').onclick = async () => {
            try {
                const r = await fetch(`/api/git/log?project=${encodeURIComponent(currentProject)}&count=20`);
                const commits = await r.json();
                infoModalTitle.textContent = 'COMMIT HISTORY';
                if (commits.length === 0) { infoModalContent.textContent = 'No commits found.'; infoModal.classList.add('active'); return; }
                let html = '<div style="display: flex; flex-direction: column; gap: 4px;">';
                commits.forEach(c => {
                    html += `<div class="commit-item" data-hash="${c.hash}"><div class="commit-hash">${escapeHtml(c.short_hash)}</div><div class="commit-msg">${escapeHtml(c.message)}</div><div class="commit-meta">${escapeHtml(c.author)} • ${escapeHtml(c.relative_date)}</div></div>`;
                });
                html += '</div>';
                infoModalContent.innerHTML = html;
                infoModal.classList.add('active');
                document.querySelectorAll('.commit-item').forEach(ci => {
                    ci.onclick = async () => {
                        const h = ci.getAttribute('data-hash');
                        try { const dr = await fetch(`/api/git/commit-detail?project=${encodeURIComponent(currentProject)}&hash=${encodeURIComponent(h)}`); const dd = await dr.json(); infoModalTitle.textContent = `COMMIT: ${dd.short_hash || ''}`; let dhtml = `<div style="margin-bottom: 8px;"><strong>${escapeHtml(dd.message || '')}</strong></div>`; if (dd.body) dhtml += `<div style="margin-bottom: 8px; color: var(--text-muted);">${escapeHtml(dd.body)}</div>`; dhtml += `<div style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 8px;">${escapeHtml(dd.author || '')} • ${escapeHtml(dd.date || '')}</div>`; if (dd.changed_files && dd.changed_files.length) { dhtml += '<div class="git-section-label">Changed Files</div>'; dd.changed_files.forEach(f => { dhtml += `<div style="padding: 2px 0; font-size: 0.75rem;"><span class="git-status ${f.status}" style="margin-right: 6px;">${escapeHtml(f.status)}</span>${escapeHtml(f.path)}</div>`; }); } infoModalContent.innerHTML = dhtml; } catch (e) {}
                    };
                });
            } catch (e) { showInfo('ERROR', 'Failed to fetch history'); }
        };

        // Pull
        document.getElementById('btnGitPull').onclick = async () => {
            try { const r = await fetch('/api/git/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject }) }); const d = await r.json(); if (d.success) { showInfo('PULL', d.output || 'Pull successful.'); fetchGitStatus(); fetchFileTree(); } else { showInfo('PULL ERROR', d.error || 'Pull failed.'); } } catch (e) { showInfo('ERROR', 'Network error'); }
        };

        // Push
        document.getElementById('btnGitPush').onclick = () => {
            const branch = document.getElementById('gitBranchTag').textContent;
            infoModalTitle.textContent = 'CONFIRM PUSH';
            infoModalContent.innerHTML = `<div style="margin-bottom: 12px;">Push "${escapeHtml(branch)}" to remote?</div><div style="display: flex; gap: 8px;"><button class="btn-approve" id="btnConfirmPush">Push</button><button class="btn-cancel" id="btnCancelPush">Cancel</button></div>`;
            infoModal.classList.add('active');
            document.getElementById('btnConfirmPush').onclick = async () => { infoModal.classList.remove('active'); try { const r = await fetch('/api/git/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: currentProject }) }); const d = await r.json(); if (d.success) { showInfo('PUSH', d.output || 'Push successful.'); } else { showInfo('PUSH ERROR', d.error || 'Push failed.'); } } catch (e) { showInfo('ERROR', 'Network error'); } };
            document.getElementById('btnCancelPush').onclick = () => infoModal.classList.remove('active');
        };

        // Fetch info on load
        async function fetchInfo() { try { const r = await fetch('/api/info'); if (r.ok) { const d = await r.json(); } } catch (e) {} }
        fetchInfo();
    </script>