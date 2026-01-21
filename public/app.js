// Firebase Configuration
const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Firestore Database Helper
const DB = {
    users: db.collection('pm_users'),
    projects: db.collection('pm_projects'),
    tasks: db.collection('pm_tasks'),
    
    getCurrentUser: () => JSON.parse(localStorage.getItem('pmCurrentUser') || 'null'),
    setCurrentUser: (user) => localStorage.setItem('pmCurrentUser', JSON.stringify(user)),
    
    async getUserProfile(uid) {
        try {
            const doc = await this.users.doc(uid).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Error getting user profile:', error);
            return null;
        }
    },
    
    async createUserProfile(uid, data) {
        try {
            await this.users.doc(uid).set({
                ...data,
                createdAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error creating user profile:', error);
            throw error;
        }
    },
    
    async getUserByEmail(email) {
        try {
            const snapshot = await this.users.where('email', '==', email).get();
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Error finding user by email:', error);
            return null;
        }
    }
};

// State
let currentUser = null;
let currentProject = null;
let projectTeamMembers = [];
let editingProjectId = null;
let editingTaskId = null;
let draggedTask = null;

// Loading helpers
function showLoading(text = 'Cargando...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function setButtonLoading(btn, loading, originalText = '') {
    if (loading) {
        btn.disabled = true;
        btn.classList.add('btn-loading');
        btn.innerHTML = `<span class="loading"></span><span>${originalText || 'Procesando...'}</span>`;
    } else {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.innerHTML = `<span>${originalText}</span>`;
    }
}

function isProjectOwner() {
    return currentProject && currentUser && currentProject.ownerId === currentUser.id;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupAuthListener();
});

// Firebase Auth State Listener
function setupAuthListener() {
    auth.onAuthStateChanged(async (user) => {
        console.log('Auth state changed:', user ? user.email : 'No user');
        if (user) {
            try {
                let profile = await DB.getUserProfile(user.uid);
                console.log('Profile found:', profile);
                
                // Si no hay perfil, crearlo con los datos de Auth
                if (!profile) {
                    console.log('Creating profile for user:', user.email);
                    await DB.createUserProfile(user.uid, {
                        name: user.displayName || user.email.split('@')[0],
                        email: user.email
                    });
                    profile = await DB.getUserProfile(user.uid);
                }
                
                if (profile) {
                    currentUser = profile;
                    DB.setCurrentUser(profile);
                    showScreen('app');
                    await loadProjects();
                }
            } catch (error) {
                console.error('Error in auth listener:', error);
                showNotification('Error al cargar perfil', 'error');
            }
        } else {
            currentUser = null;
            DB.setCurrentUser(null);
            showScreen('login');
        }
    });
}

function setupEventListeners() {
    // Login/Register
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('showRegister').addEventListener('click', () => showScreen('register'));
    document.getElementById('showLogin').addEventListener('click', () => showScreen('login'));
    
    // Navigation
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('profileBtn').addEventListener('click', openProfileModal);
    document.getElementById('createProjectBtn').addEventListener('click', () => openProjectModal());
    document.getElementById('backToProjects').addEventListener('click', showProjectsList);
    document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
    document.getElementById('editProjectBtn').addEventListener('click', () => openProjectModal(currentProject.id));
    document.getElementById('manageTeamBtn').addEventListener('click', openTeamModal);
    
    // Modals close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.add('hidden');
        });
    });
    
    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });
    
    // Forms
    document.getElementById('projectForm').addEventListener('submit', handleSaveProject);
    document.getElementById('taskForm').addEventListener('submit', handleSaveTask);
    document.getElementById('profileForm').addEventListener('submit', handleSaveProfile);
    document.getElementById('addMemberBtn').addEventListener('click', handleAddMember);
    
    // Project status change to show actual end date
    document.getElementById('projectStatusInput').addEventListener('change', (e) => {
        const actualEndField = document.getElementById('actualEndDateField');
        if (e.target.value === 'completado' || e.target.value === 'cancelado') {
            actualEndField.classList.remove('hidden');
            // Set today as default if empty
            const actualEndInput = document.getElementById('projectActualEndInput');
            if (!actualEndInput.value) {
                actualEndInput.valueAsDate = new Date();
            }
        } else {
            actualEndField.classList.add('hidden');
        }
    });
}

function showScreen(screen) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('registerScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.add('hidden');
    
    if (screen === 'login') {
        document.getElementById('loginScreen').classList.remove('hidden');
    } else if (screen === 'register') {
        document.getElementById('registerScreen').classList.remove('hidden');
    } else if (screen === 'app') {
        document.getElementById('appScreen').classList.remove('hidden');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span>';
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        document.getElementById('loginForm').reset();
    } catch (error) {
        console.error('Error en login:', error);
        let errorMessage = 'Error al iniciar sesion';
        
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorMessage = 'Email o contraseña incorrectos';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Email invalido';
                break;
        }
        
        showNotification(errorMessage, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar Sesion';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span>';
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        await DB.createUserProfile(user.uid, { name, email });
        await user.updateProfile({ displayName: name });
        
        showNotification('Registro exitoso', 'success');
        document.getElementById('registerForm').reset();
    } catch (error) {
        console.error('Error en registro:', error);
        let errorMessage = 'Error al registrar usuario';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'El email ya esta registrado';
                break;
            case 'auth/weak-password':
                errorMessage = 'La contraseña debe tener al menos 6 caracteres';
                break;
        }
        
        showNotification(errorMessage, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrarse';
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        showNotification('Sesion cerrada', 'success');
    } catch (error) {
        console.error('Error al cerrar sesion:', error);
        showNotification('Error al cerrar sesion', 'error');
    }
}

// Profile Functions
function openProfileModal() {
    document.getElementById('profileAvatar').textContent = getInitials(currentUser.name);
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileNameInput').value = currentUser.name;
    document.getElementById('profileModal').classList.remove('hidden');
}

async function handleSaveProfile(e) {
    e.preventDefault();
    
    const newName = document.getElementById('profileNameInput').value.trim();
    const btn = document.getElementById('saveProfileBtn');
    
    if (!newName) {
        showNotification('El nombre es requerido', 'warning');
        return;
    }
    
    if (newName === currentUser.name) {
        document.getElementById('profileModal').classList.add('hidden');
        return;
    }
    
    setButtonLoading(btn, true, 'Guardando...');
    
    try {
        await DB.users.doc(currentUser.id).update({ name: newName });
        
        currentUser.name = newName;
        
        // Update UI
        document.getElementById('userNameDisplay').textContent = newName;
        document.getElementById('userAvatarNav').textContent = getInitials(newName);
        document.getElementById('profileAvatar').textContent = getInitials(newName);
        
        // Update in all projects where user is member
        const projectsSnapshot = await DB.projects.where('teamMemberIds', 'array-contains', currentUser.id).get();
        
        const batch = db.batch();
        projectsSnapshot.docs.forEach(doc => {
            const project = doc.data();
            const updatedMembers = (project.teamMembers || []).map(member => {
                if (member.id === currentUser.id) {
                    return { ...member, name: newName };
                }
                return member;
            });
            
            const updateData = { teamMembers: updatedMembers };
            if (project.ownerId === currentUser.id) {
                updateData.ownerName = newName;
            }
            
            batch.update(DB.projects.doc(doc.id), updateData);
        });
        
        await batch.commit();
        
        showNotification('Perfil actualizado', 'success');
        document.getElementById('profileModal').classList.add('hidden');
        
        await loadProjects();
        
    } catch (error) {
        console.error('Error updating profile:', error);
        showNotification('Error al actualizar perfil', 'error');
    } finally {
        setButtonLoading(btn, false, 'Guardar Cambios');
    }
}

async function loadProjects() {
    try {
        document.getElementById('userNameDisplay').textContent = currentUser.name;
        document.getElementById('userAvatarNav').textContent = getInitials(currentUser.name);
        
        // Get projects where user is owner or team member
        const ownedSnapshot = await DB.projects.where('ownerId', '==', currentUser.id).get();
        const memberSnapshot = await DB.projects.where('teamMemberIds', 'array-contains', currentUser.id).get();
        
        const projectsMap = new Map();
        
        ownedSnapshot.docs.forEach(doc => {
            projectsMap.set(doc.id, { id: doc.id, ...doc.data(), isOwner: true });
        });
        
        memberSnapshot.docs.forEach(doc => {
            if (!projectsMap.has(doc.id)) {
                projectsMap.set(doc.id, { id: doc.id, ...doc.data(), isOwner: false });
            }
        });
        
        const projects = Array.from(projectsMap.values());
        
        const container = document.getElementById('projectsList');
        
        if (projects.length === 0) {
            container.innerHTML = `
                <div class="col-span-full empty-state">
                    <div class="empty-state-icon">[ ]</div>
                    <p class="text-lg font-medium mb-2">No hay proyectos</p>
                    <p class="text-sm">Crea tu primer proyecto para comenzar</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = projects.map(project => {
            const teamCount = (project.teamMemberIds || []).length;
            const startDate = new Date(project.startDate);
            const endDate = new Date(project.estimatedEndDate);
            const today = new Date();
            today.setHours(0,0,0,0);
            endDate.setHours(0,0,0,0);
            const isCompleted = project.status === 'completado' || project.status === 'cancelado';
            const daysLeft = Math.round((endDate - today) / (1000 * 60 * 60 * 24));
            const isOverdue = daysLeft < 0 && !isCompleted;
            const isUrgent = daysLeft <= 7 && daysLeft > 0 && !isCompleted;
            const isDueToday = daysLeft === 0 && !isCompleted;
            const isOnTime = daysLeft > 7 && !isCompleted;
            
            // Determine time status - simplified
            let timeStatusHTML = '';
            if (!isCompleted) {
                if (isOverdue) {
                    timeStatusHTML = `
                        <div class="time-indicator overdue">
                            <span class="time-indicator-dot"></span>
                            Vencido hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) !== 1 ? 's' : ''}
                        </div>
                    `;
                } else if (isDueToday) {
                    timeStatusHTML = `
                        <div class="time-indicator urgent">
                            <span class="time-indicator-dot"></span>
                            Vence hoy
                        </div>
                    `;
                } else if (isUrgent) {
                    timeStatusHTML = `
                        <div class="time-indicator warning">
                            <span class="time-indicator-dot"></span>
                            Faltan ${daysLeft} día${daysLeft !== 1 ? 's' : ''}
                        </div>
                    `;
                } else if (isOnTime) {
                    timeStatusHTML = `
                        <div class="time-indicator on-time">
                            <span class="time-indicator-dot"></span>
                            En tiempo - ${daysLeft} días
                        </div>
                    `;
                }
            }
            
            return `
                <div class="project-card status-${project.status} fade-in" onclick="openProject('${project.id}')">
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="text-xl font-bold text-gray-800">${project.name}</h3>
                        <span class="status-badge ${project.status}">${getStatusLabel(project.status)}</span>
                    </div>
                    <p class="text-gray-600 text-sm mb-4 line-clamp-2">${project.description || 'Sin descripcion'}</p>
                    
                    <div class="flex flex-wrap gap-2 mb-3">
                        <span class="date-badge start">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                            Inicio: ${formatDate(startDate)}
                        </span>
                        <span class="date-badge ${isOverdue ? 'overdue' : isUrgent || isDueToday ? 'urgent' : 'end'}">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            Cierre: ${formatDate(endDate)}
                        </span>
                    </div>
                    
                    ${timeStatusHTML}
                    
                    <div class="flex items-center justify-between text-xs text-gray-500 ${timeStatusHTML ? 'pt-3 border-t border-gray-100' : ''}">
                        <div class="flex items-center gap-1">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                            ${teamCount} miembro${teamCount !== 1 ? 's' : ''}
                        </div>
                        ${project.isOwner ? '<span class="text-indigo-600 font-semibold">Propietario</span>' : '<span class="text-purple-600">Miembro</span>'}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading projects:', error);
        showNotification('Error al cargar proyectos', 'error');
    }
}

function openProjectModal(projectId = null) {
    editingProjectId = projectId;
    const modal = document.getElementById('projectModal');
    const title = document.getElementById('projectModalTitle');
    const form = document.getElementById('projectForm');
    
    form.reset();
    document.getElementById('actualEndDateField').classList.add('hidden');
    
    if (projectId) {
        title.textContent = 'Editar Proyecto';
        loadProjectData(projectId);
    } else {
        title.textContent = 'Crear Proyecto';
        document.getElementById('projectStartDateInput').valueAsDate = new Date();
    }
    
    modal.classList.remove('hidden');
}

async function loadProjectData(projectId) {
    try {
        const doc = await DB.projects.doc(projectId).get();
        if (doc.exists) {
            const project = doc.data();
            document.getElementById('projectName').value = project.name;
            document.getElementById('projectDescriptionInput').value = project.description || '';
            document.getElementById('projectStatusInput').value = project.status;
            document.getElementById('projectStartDateInput').value = project.startDate.split('T')[0];
            document.getElementById('projectEstimatedEndInput').value = project.estimatedEndDate.split('T')[0];
            
            if (project.status === 'completado' || project.status === 'cancelado') {
                document.getElementById('actualEndDateField').classList.remove('hidden');
                if (project.actualEndDate) {
                    document.getElementById('projectActualEndInput').value = project.actualEndDate.split('T')[0];
                }
            }
        }
    } catch (error) {
        console.error('Error loading project:', error);
        showNotification('Error al cargar proyecto', 'error');
    }
}

async function handleSaveProject(e) {
    e.preventDefault();
    
    const btn = document.getElementById('saveProjectBtn');
    setButtonLoading(btn, true, 'Guardando...');
    
    const projectData = {
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDescriptionInput').value,
        status: document.getElementById('projectStatusInput').value,
        startDate: new Date(document.getElementById('projectStartDateInput').value).toISOString(),
        estimatedEndDate: new Date(document.getElementById('projectEstimatedEndInput').value).toISOString()
    };
    
    const actualEndDate = document.getElementById('projectActualEndInput').value;
    if (actualEndDate) {
        projectData.actualEndDate = new Date(actualEndDate).toISOString();
    } else {
        projectData.actualEndDate = null;
    }
    
    try {
        if (editingProjectId) {
            await DB.projects.doc(editingProjectId).update(projectData);
            showNotification('Proyecto actualizado', 'success');
            
            if (currentProject && currentProject.id === editingProjectId) {
                await openProject(editingProjectId);
            }
        } else {
            projectData.ownerId = currentUser.id;
            projectData.ownerName = currentUser.name;
            projectData.teamMemberIds = [currentUser.id];
            projectData.teamMembers = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email }];
            projectData.createdAt = new Date().toISOString();
            
            await DB.projects.add(projectData);
            showNotification('Proyecto creado', 'success');
        }
        
        document.getElementById('projectModal').classList.add('hidden');
        await loadProjects();
    } catch (error) {
        console.error('Error saving project:', error);
        showNotification('Error al guardar proyecto', 'error');
    } finally {
        setButtonLoading(btn, false, 'Guardar Proyecto');
    }
}

async function openProject(projectId) {
    showLoading('Cargando proyecto...');
    
    try {
        const doc = await DB.projects.doc(projectId).get();
        if (!doc.exists) {
            hideLoading();
            return;
        }
        
        currentProject = { id: doc.id, ...doc.data() };
        projectTeamMembers = currentProject.teamMembers || [];
        
        document.getElementById('projectsView').classList.add('hidden');
        document.getElementById('projectDetailView').classList.remove('hidden');
        
        // Update project info
        document.getElementById('projectTitle').textContent = currentProject.name;
        document.getElementById('projectDescription').textContent = currentProject.description || 'Sin descripcion';
        document.getElementById('projectStatus').textContent = getStatusLabel(currentProject.status);
        document.getElementById('projectStartDate').textContent = formatDate(new Date(currentProject.startDate));
        document.getElementById('projectEstimatedEnd').textContent = formatDate(new Date(currentProject.estimatedEndDate));
        
        // Time status indicator
        updateTimeStatusBanner();
        
        if (currentProject.actualEndDate) {
            document.getElementById('projectActualEndContainer').classList.remove('hidden');
            document.getElementById('projectActualEnd').textContent = formatDate(new Date(currentProject.actualEndDate));
        } else {
            document.getElementById('projectActualEndContainer').classList.add('hidden');
        }
        
        // Show team members
        renderTeamMembersDisplay();
        
        // Load tasks
        await loadTasks();
        
        hideLoading();
    } catch (error) {
        console.error('Error opening project:', error);
        showNotification('Error al abrir proyecto', 'error');
        hideLoading();
    }
}

function updateTimeStatusBanner() {
    const badge = document.getElementById('timeStatusBadge');
    const status = currentProject.status;
    
    // Don't show for completed or cancelled projects
    if (status === 'completado' || status === 'cancelado') {
        badge.className = 'hidden';
        badge.innerHTML = '';
        return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(currentProject.estimatedEndDate);
    endDate.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((endDate - today) / (1000 * 60 * 60 * 24));
    
    let bgClass = '';
    let text = '';
    let icon = '';
    
    if (daysLeft < 0) {
        bgClass = 'bg-red-100 border border-red-300';
        icon = `<svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
        text = `<span class="text-red-700 font-semibold">Vencido hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) !== 1 ? 's' : ''}</span>`;
    } else if (daysLeft === 0) {
        bgClass = 'bg-orange-100 border border-orange-300';
        icon = `<svg class="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        text = `<span class="text-orange-700 font-semibold">¡Vence hoy!</span>`;
    } else if (daysLeft <= 7) {
        bgClass = 'bg-amber-100 border border-amber-300';
        icon = `<svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        text = `<span class="text-amber-700 font-semibold">Faltan ${daysLeft} día${daysLeft !== 1 ? 's' : ''}</span>`;
    } else {
        bgClass = 'bg-emerald-100 border border-emerald-300';
        icon = `<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        text = `<span class="text-emerald-700 font-semibold">En tiempo (${daysLeft} días)</span>`;
    }
    
    badge.className = `p-3 rounded-lg flex items-center gap-2 ${bgClass}`;
    badge.innerHTML = `${icon}${text}`;
}

function renderTeamMembersDisplay() {
    const container = document.getElementById('teamMembersDisplay');
    const members = currentProject.teamMembers || [];
    
    container.innerHTML = `
        <span class="text-sm text-gray-600">Equipo:</span>
        ${members.map(member => {
            const isOwner = member.id === currentProject.ownerId;
            const role = isOwner ? 'propietario' : (member.role || 'desarrollador');
            return `
                <span class="member-badge small" title="${getRoleLabel(role)}">
                    <span class="member-avatar small">${getInitials(member.name)}</span>
                    ${member.name}
                </span>
            `;
        }).join('')}
    `;
}

function showProjectsList() {
    document.getElementById('projectDetailView').classList.add('hidden');
    document.getElementById('projectsView').classList.remove('hidden');
    currentProject = null;
    projectTeamMembers = [];
    loadProjects();
}

// Team Management
function openTeamModal() {
    const modal = document.getElementById('teamModal');
    const addSection = document.getElementById('addMemberSection');
    
    document.getElementById('memberEmail').value = '';
    
    // Solo el propietario puede agregar miembros
    if (isProjectOwner()) {
        addSection.classList.remove('hidden');
    } else {
        addSection.classList.add('hidden');
    }
    
    renderTeamMembersList();
    modal.classList.remove('hidden');
}

function renderTeamMembersList() {
    const container = document.getElementById('teamMembersList');
    const members = currentProject.teamMembers || [];
    const canManage = isProjectOwner();
    
    if (members.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No hay miembros en el equipo</p>';
        return;
    }
    
    const roleLabels = {
        'desarrollador': 'Desarrollador',
        'tester': 'Tester',
        'diseñador': 'Diseñador',
        'lider': 'Líder'
    };
    
    container.innerHTML = members.map(member => {
        const isOwner = member.id === currentProject.ownerId;
        const currentRole = member.role || 'desarrollador';
        
        return `
            <div class="team-member-item flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3" id="member-${member.id}">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <span class="member-avatar flex-shrink-0">${getInitials(member.name)}</span>
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-gray-800 truncate">${member.name}</p>
                        <p class="text-sm text-gray-500 truncate">${member.email}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                    ${isOwner ? `<span class="role-badge propietario text-xs">Propietario</span>` : ''}
                    ${canManage ? `
                        <select onchange="updateMemberRole('${member.id}', this.value)" 
                            class="text-xs sm:text-sm px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 cursor-pointer flex-1 sm:flex-none">
                            <option value="desarrollador" ${currentRole === 'desarrollador' ? 'selected' : ''}>Desarrollador</option>
                            <option value="tester" ${currentRole === 'tester' ? 'selected' : ''}>Tester</option>
                            <option value="diseñador" ${currentRole === 'diseñador' ? 'selected' : ''}>Diseñador</option>
                            <option value="lider" ${currentRole === 'lider' ? 'selected' : ''}>Líder</option>
                        </select>
                    ` : `
                        <span class="role-badge ${currentRole} text-xs">${roleLabels[currentRole]}</span>
                    `}
                    ${!isOwner && canManage ? `
                        <button onclick="removeMember('${member.id}')" class="text-red-600 hover:text-red-800 text-xs sm:text-sm font-medium whitespace-nowrap">
                            Quitar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function handleAddMember() {
    const email = document.getElementById('memberEmail').value.trim();
    const role = document.getElementById('memberRole').value;
    const btn = document.getElementById('addMemberBtn');
    
    if (!email) {
        showNotification('Ingresa un email', 'warning');
        return;
    }
    
    setButtonLoading(btn, true, 'Agregando...');
    
    try {
        const user = await DB.getUserByEmail(email);
        
        if (!user) {
            showNotification('Usuario no encontrado', 'error');
            return;
        }
        
        const currentMembers = currentProject.teamMemberIds || [];
        if (currentMembers.includes(user.id)) {
            showNotification('El usuario ya es miembro', 'warning');
            return;
        }
        
        const updatedMemberIds = [...currentMembers, user.id];
        const updatedMembers = [...(currentProject.teamMembers || []), {
            id: user.id,
            name: user.name,
            email: user.email,
            role: role
        }];
        
        await DB.projects.doc(currentProject.id).update({
            teamMemberIds: updatedMemberIds,
            teamMembers: updatedMembers
        });
        
        currentProject.teamMemberIds = updatedMemberIds;
        currentProject.teamMembers = updatedMembers;
        projectTeamMembers = updatedMembers;
        
        document.getElementById('memberEmail').value = '';
        renderTeamMembersList();
        renderTeamMembersDisplay();
        showNotification('Miembro agregado', 'success');
    } catch (error) {
        console.error('Error adding member:', error);
        showNotification('Error al agregar miembro', 'error');
    } finally {
        setButtonLoading(btn, false, 'Agregar Miembro');
    }
}

async function removeMember(memberId) {
    if (!confirm('Quitar este miembro del equipo?')) return;
    
    showLoading('Removiendo miembro...');
    
    try {
        const updatedMemberIds = currentProject.teamMemberIds.filter(id => id !== memberId);
        const updatedMembers = currentProject.teamMembers.filter(m => m.id !== memberId);
        
        // Also unassign from tasks
        const tasksSnapshot = await DB.tasks.where('projectId', '==', currentProject.id)
            .where('assigneeId', '==', memberId).get();
        
        const batch = db.batch();
        tasksSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { assigneeId: null, assigneeName: null });
        });
        
        batch.update(DB.projects.doc(currentProject.id), {
            teamMemberIds: updatedMemberIds,
            teamMembers: updatedMembers
        });
        
        await batch.commit();
        
        currentProject.teamMemberIds = updatedMemberIds;
        currentProject.teamMembers = updatedMembers;
        projectTeamMembers = updatedMembers;
        
        renderTeamMembersList();
        renderTeamMembersDisplay();
        await loadTasks();
        showNotification('Miembro removido', 'success');
    } catch (error) {
        console.error('Error removing member:', error);
        showNotification('Error al remover miembro', 'error');
    } finally {
        hideLoading();
    }
}

async function updateMemberRole(memberId, newRole) {
    try {
        const updatedMembers = currentProject.teamMembers.map(member => {
            if (member.id === memberId) {
                return { ...member, role: newRole };
            }
            return member;
        });
        
        await DB.projects.doc(currentProject.id).update({
            teamMembers: updatedMembers
        });
        
        currentProject.teamMembers = updatedMembers;
        projectTeamMembers = updatedMembers;
        
        renderTeamMembersDisplay();
        showNotification('Rol actualizado', 'success');
    } catch (error) {
        console.error('Error updating member role:', error);
        showNotification('Error al actualizar rol', 'error');
        renderTeamMembersList(); // Revert UI
    }
}

// Tasks Management
async function loadTasks() {
    if (!currentProject) return;
    
    try {
        const snapshot = await DB.tasks.where('projectId', '==', currentProject.id).get();
        const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Clear all columns
        ['pendiente', 'por-hacer', 'haciendo', 'terminada'].forEach(status => {
            document.getElementById(`tasks${capitalize(status)}`).innerHTML = '';
        });
        
        // Render tasks in their columns
        tasks.forEach(task => {
            renderTask(task);
        });
        
        // Update counters
        updateTaskCounters(tasks);
        
        // Setup drag and drop
        setupDragAndDrop();
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Error al cargar tareas', 'error');
    }
}

function renderTask(task) {
    const containerId = `tasks${capitalize(task.status)}`;
    const container = document.getElementById(containerId);
    
    const taskElement = document.createElement('div');
    taskElement.className = `task-card priority-${task.priority} fade-in`;
    taskElement.draggable = true;
    taskElement.dataset.taskId = task.id;
    
    taskElement.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <h4 class="font-semibold text-gray-800 text-sm">${task.title}</h4>
            <span class="priority-badge ${task.priority}">${getPriorityLabel(task.priority)}</span>
        </div>
        ${task.description ? `<p class="text-xs text-gray-600 mb-2">${task.description}</p>` : ''}
        <div class="flex items-center justify-between mt-3">
            ${task.assigneeName ? `
                <div class="flex items-center gap-1.5">
                    <span class="member-avatar small">${getInitials(task.assigneeName)}</span>
                    <span class="text-xs text-slate-500">${task.assigneeName}</span>
                </div>
            ` : '<div></div>'}
            <div class="flex gap-1">
                <button onclick="event.stopPropagation(); openTaskModal('${task.id}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Editar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button onclick="event.stopPropagation(); deleteTask('${task.id}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Eliminar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        </div>
    `;
    
    container.appendChild(taskElement);
}

function setupDragAndDrop() {
    const taskCards = document.querySelectorAll('.task-card');
    const taskContainers = document.querySelectorAll('.kanban-tasks');
    
    taskCards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });
    
    taskContainers.forEach(container => {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
        container.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(e) {
    draggedTask = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.kanban-tasks').forEach(container => {
        container.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    if (!draggedTask) return;
    
    const newStatus = e.currentTarget.closest('.kanban-column').dataset.status;
    const taskId = draggedTask.dataset.taskId;
    
    try {
        await DB.tasks.doc(taskId).update({ status: newStatus });
        await loadTasks();
        showNotification('Tarea movida', 'success');
    } catch (error) {
        console.error('Error moving task:', error);
        showNotification('Error al mover tarea', 'error');
    }
}

function updateTaskCounters(tasks) {
    const counts = {
        'pendiente': 0,
        'por-hacer': 0,
        'haciendo': 0,
        'terminada': 0
    };
    
    tasks.forEach(task => {
        counts[task.status]++;
    });
    
    document.getElementById('countPendiente').textContent = counts['pendiente'];
    document.getElementById('countPorHacer').textContent = counts['por-hacer'];
    document.getElementById('countHaciendo').textContent = counts['haciendo'];
    document.getElementById('countTerminada').textContent = counts['terminada'];
}

function openTaskModal(taskId = null) {
    editingTaskId = taskId;
    const modal = document.getElementById('taskModal');
    const title = document.getElementById('taskModalTitle');
    const form = document.getElementById('taskForm');
    
    form.reset();
    
    // Populate assignee dropdown with team members only
    const assigneeSelect = document.getElementById('taskAssignee');
    assigneeSelect.innerHTML = '<option value="">Sin asignar</option>';
    
    const members = currentProject.teamMembers || [];
    members.forEach(member => {
        assigneeSelect.innerHTML += `<option value="${member.id}">${member.name}</option>`;
    });
    
    if (taskId) {
        title.textContent = 'Editar Tarea';
        loadTaskData(taskId);
    } else {
        title.textContent = 'Nueva Tarea';
    }
    
    modal.classList.remove('hidden');
}

async function loadTaskData(taskId) {
    try {
        const doc = await DB.tasks.doc(taskId).get();
        if (doc.exists) {
            const task = doc.data();
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDescription').value = task.description || '';
            document.getElementById('taskPriority').value = task.priority;
            document.getElementById('taskAssignee').value = task.assigneeId || '';
        }
    } catch (error) {
        console.error('Error loading task:', error);
        showNotification('Error al cargar tarea', 'error');
    }
}

async function handleSaveTask(e) {
    e.preventDefault();
    
    if (!currentProject) return;
    
    const btn = document.getElementById('saveTaskBtn');
    setButtonLoading(btn, true, 'Guardando...');
    
    const assigneeId = document.getElementById('taskAssignee').value;
    const assignee = assigneeId ? projectTeamMembers.find(m => m.id === assigneeId) : null;
    
    const taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        priority: document.getElementById('taskPriority').value,
        projectId: currentProject.id,
        assigneeId: assigneeId || null,
        assigneeName: assignee ? assignee.name : null
    };
    
    try {
        if (editingTaskId) {
            await DB.tasks.doc(editingTaskId).update(taskData);
            showNotification('Tarea actualizada', 'success');
        } else {
            taskData.status = 'pendiente';
            taskData.createdAt = new Date().toISOString();
            await DB.tasks.add(taskData);
            showNotification('Tarea creada', 'success');
        }
        
        document.getElementById('taskModal').classList.add('hidden');
        await loadTasks();
    } catch (error) {
        console.error('Error saving task:', error);
        showNotification('Error al guardar tarea', 'error');
    } finally {
        setButtonLoading(btn, false, 'Guardar Tarea');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Eliminar esta tarea?')) return;
    
    showLoading('Eliminando tarea...');
    
    try {
        await DB.tasks.doc(taskId).delete();
        showNotification('Tarea eliminada', 'success');
        await loadTasks();
    } catch (error) {
        console.error('Error deleting task:', error);
        showNotification('Error al eliminar tarea', 'error');
    } finally {
        hideLoading();
    }
}

// Utility functions
function getStatusLabel(status) {
    const labels = {
        'activo': 'Activo',
        'en-pausa': 'En Pausa',
        'completado': 'Completado',
        'cancelado': 'Cancelado'
    };
    return labels[status] || status;
}

function getPriorityLabel(priority) {
    const labels = {
        'baja': 'Baja',
        'media': 'Media',
        'alta': 'Alta'
    };
    return labels[priority] || priority;
}

function getRoleLabel(role) {
    const labels = {
        'propietario': 'Propietario',
        'desarrollador': 'Desarrollador',
        'tester': 'Tester',
        'diseñador': 'Diseñador',
        'lider': 'Lider de Equipo'
    };
    return labels[role] || role;
}

function capitalize(str) {
    return str.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(date) {
    return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<p class="font-medium">${message}</p>`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Make functions globally accessible for onclick handlers
window.openProject = openProject;
window.openTaskModal = openTaskModal;
window.deleteTask = deleteTask;
window.removeMember = removeMember;
window.updateMemberRole = updateMemberRole;
