/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { AppUser, Branch, UserRole } from '../types';
import { useToast } from '../contexts/ToastContext';
import './UsersPage.css';
import '../components/Table.css';
import '../components/Button.css';

interface UsersPageProps {
    profile: AppUser | null;
}

const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });

const UsersPage: React.FC<UsersPageProps> = ({ profile }) => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentUser, setCurrentUser] = useState<Partial<AppUser> & { password?: string; newPassword?: string } | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const { addToast } = useToast();

    // Roles y permisos
    const isOwner = profile?.rol === 'Propietario';
    const isAdministrator = profile?.rol === 'Administrador';
    const isEmployee = profile?.rol === 'Empleado';
    const canAddUsers = isOwner || isAdministrator;

    const fetchData = useCallback(async () => {
        setLoading(true);

        const usersQuery = supabase
            .from('Usuarios')
            .select('id, nombre:Nombre, email:Email, rol, avatar_link:Avatar_link, id_Sucursal, sucursal:Sucursales(nombre:Nombre)')
            .not('rol', 'is', null)
            .order('Nombre', { ascending: true });
        
        const branchesPromise = supabase
            .from('Sucursales')
            .select('id, nombre:Nombre');

        const [usersResult, branchesResult] = await Promise.all([usersQuery, branchesPromise]);
        
        if (usersResult.error) {
            addToast(`Error al cargar usuarios: ${usersResult.error.message}`, 'error');
        } else {
            const transformedUsers = usersResult.data.map((user: any) => ({
                ...user,
                sucursal: Array.isArray(user.sucursal) ? user.sucursal[0] || null : user.sucursal,
            }));
            setUsers(transformedUsers as unknown as AppUser[]);
        }

        if (branchesResult.error) {
            addToast(`Error al cargar sucursales: ${branchesResult.error.message}`, 'error');
        } else {
            setBranches(branchesResult.data as Branch[]);
        }
        
        setLoading(false);
    }, [addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    const cleanupModalState = () => {
        setIsModalOpen(false);
        setCurrentUser(null);
        setAvatarFile(null);
        setAvatarPreview(null);
    };

    const openModal = (user: AppUser | null = null) => {
        if (user) {
            setCurrentUser({ ...user, newPassword: '' });
        } else {
             setCurrentUser({ 
                nombre: '', 
                email: '', 
                password: '', 
                rol: 'Empleado',
                id_Sucursal: isAdministrator ? profile?.id_Sucursal : undefined
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        cleanupModalState();
    };
    
    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!currentUser || !currentUser.email || !currentUser.nombre) {
            addToast("Nombre y Email son obligatorios.", 'error');
            return;
        }
        
        setIsSaving(true);
        let newAvatarUrl: string | undefined = undefined;

        try {
            if (currentUser.id) {
                // --- ACTUALIZAR USUARIO EXISTENTE ---
                if (avatarFile) {
                    const avatarBase64 = await toBase64(avatarFile);
                    const { data, error: functionError } = await supabase.functions.invoke('upload-avatar', {
                        body: { userId: currentUser.id, avatarBase64, contentType: avatarFile.type },
                    });
                    if (functionError) throw new Error(`Error al subir imagen: ${data?.msg || functionError.message}`);
                    newAvatarUrl = data.publicUrl;
                }

                const updatePayload: { [key: string]: any } = {
                    Nombre: currentUser.nombre,
                };
                if (isOwner || isAdministrator) updatePayload.rol = currentUser.rol;
                if (isOwner) updatePayload.id_Sucursal = currentUser.id_Sucursal;
                if (newAvatarUrl) updatePayload.Avatar_link = newAvatarUrl;
                
                const { data, error: updateError } = await supabase.from('Usuarios').update(updatePayload).eq('id', currentUser.id).select();
                if (updateError) throw updateError;
                if (!data || data.length === 0) throw new Error("Error de Permisos: La base de datos bloqueó la actualización.");

                if (currentUser.newPassword && currentUser.newPassword.length >= 6) {
                    const { data, error: passwordError } = await supabase.functions.invoke('update-user-password', {
                        body: { userId: currentUser.id, newPassword: currentUser.newPassword },
                    });
                    if (passwordError) throw new Error(data?.msg || passwordError.message);
                } else if (currentUser.newPassword && currentUser.newPassword.length > 0) {
                    throw new Error("La nueva contraseña debe tener al menos 6 caracteres.");
                }
                
                addToast('Usuario actualizado correctamente.', 'success');

            } else {
                // --- CREAR NUEVO USUARIO ---
                if (!currentUser.password || currentUser.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

                const { data, error } = await supabase.functions.invoke('create-user', {
                    body: { email: currentUser.email, password: currentUser.password, nombre: currentUser.nombre, rol: currentUser.rol, id_sucursal: isOwner ? currentUser.id_Sucursal : profile?.id_Sucursal },
                });
                if (error) throw new Error(data?.msg || error.message);
                const newUserId = data.userId;
                if (!newUserId) throw new Error('No se pudo obtener el ID del nuevo usuario.');

                if (avatarFile) {
                    const avatarBase64 = await toBase64(avatarFile);
                    const { data: fnData, error: functionError } = await supabase.functions.invoke('upload-avatar', {
                         body: { userId: newUserId, avatarBase64, contentType: avatarFile.type },
                    });

                    if (functionError) {
                        addToast('Usuario creado, pero falló la subida del avatar.', 'error');
                    } else {
                        newAvatarUrl = fnData.publicUrl;
                        const { error: avatarUpdateError } = await supabase.from('Usuarios').update({ Avatar_link: newAvatarUrl }).eq('id', newUserId);
                        if (avatarUpdateError) addToast('Usuario creado, pero falló la actualización del perfil con el avatar.', 'error');
                    }
                }
                addToast('Usuario creado correctamente.', 'success');
            }
            
            cleanupModalState();
            fetchData();

        } catch (error: any) {
            console.error("Error saving user:", error.message, error);
            addToast(error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (user: AppUser) => {
        if (window.confirm(`¿Está seguro de que desea desactivar al usuario "${user.nombre}"?`)) {
             try {
                const { error } = await supabase.from('Usuarios').update({ rol: null, id_Sucursal: null }).eq('id', user.id).select();
                if (error) throw new Error("Error de Permisos: La base de datos bloqueó la desactivación.");
                addToast(`Usuario "${user.nombre}" desactivado.`, 'success');
                fetchData();
            } catch (error: any) {
                addToast(error.message, 'error');
            }
        }
    };

    const canEditUser = (userToEdit: AppUser): boolean => {
        if (!profile) return false;
        if (isOwner) return true;
        if (isAdministrator) return userToEdit.rol !== 'Propietario' && userToEdit.id_Sucursal === profile.id_Sucursal;
        if (isEmployee) return userToEdit.id === profile.id;
        return false;
    };

    const canDeleteUser = (userToDelete: AppUser): boolean => {
        if (!profile || userToDelete.id === profile.id) return false;
        if (isOwner) return userToDelete.rol !== 'Propietario';
        if (isAdministrator) return userToDelete.rol !== 'Propietario' && userToDelete.id_Sucursal === profile.id_Sucursal;
        return false;
    };
    
    const roleOptions = isOwner ? ['Propietario', 'Administrador', 'Empleado'] : ['Administrador', 'Empleado'];

    const groupedUsers = useMemo(() => {
        const groups: { [key: string]: AppUser[] } = {};
        users.forEach(user => {
            const branchName = user.sucursal?.nombre || 'Sin Asignar';
            if (!groups[branchName]) groups[branchName] = [];
            groups[branchName].push(user);
        });
        const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
            if (a === 'Sin Asignar') return 1;
            if (b === 'Sin Asignar') return -1;
            return a.localeCompare(b);
        });
        const sortedGroups: { [key: string]: AppUser[] } = {};
        sortedGroupKeys.forEach(key => sortedGroups[key] = groups[key]);
        return sortedGroups;
    }, [users]);

    if (loading) return <p>Cargando usuarios...</p>;

    return (
        <div className="users-page">
            {canAddUsers && (
                <div className="users-page__actions">
                    <button onClick={() => openModal()} className="btn btn--primary">
                        <span className="material-icons">add</span>
                        Añadir Usuario
                    </button>
                </div>
            )}
            <div className="table-shared-container">
                <table className="users-page__table table-shared" aria-label="Tabla de usuarios">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Email</th>
                            <th>Rol</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                         {Object.entries(groupedUsers).map(([branchName, usersInGroup]) => (
                            <React.Fragment key={branchName}>
                                <tr className="table-group-header">
                                    <td colSpan={4}>
                                        {branchName} ({usersInGroup.length} {usersInGroup.length === 1 ? 'usuario' : 'usuarios'})
                                    </td>
                                </tr>
                                {usersInGroup.map(user => (
                                    <tr key={user.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <Avatar userName={user.nombre} avatarUrl={user.avatar_link} />
                                                {user.nombre}
                                            </div>
                                        </td>
                                        <td>{user.email}</td>
                                        <td>{user.rol}</td>
                                        <td>
                                            {canEditUser(user) && (
                                                <button onClick={() => openModal(user)} className="btn-icon" aria-label={`Editar ${user.nombre}`}><span className="material-icons">edit</span></button>
                                            )}
                                            {canDeleteUser(user) && (
                                                <button onClick={() => handleDelete(user)} className="btn-icon" aria-label={`Desactivar ${user.nombre}`}><span className="material-icons">delete</span></button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
            
             {isModalOpen && currentUser && profile && (
                <Modal 
                    title={currentUser.id ? 'Editar Usuario' : 'Nuevo Usuario'}
                    onClose={closeModal}
                >
                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                             <div className="users-page__avatar-upload-section">
                                <Avatar 
                                    userName={currentUser.nombre || '?'} 
                                    avatarUrl={avatarPreview || currentUser.avatar_link || null} 
                                />
                                <div className="form-group">
                                    <label htmlFor="user-avatar">Imagen de Perfil</label>
                                    <input 
                                        id="user-avatar" 
                                        type="file" 
                                        accept="image/png, image/jpeg, image/webp" 
                                        onChange={handleAvatarChange}
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="user-name">Nombre Completo</label>
                                <input id="user-name" type="text" value={currentUser.nombre || ''} onChange={e => setCurrentUser({...currentUser, nombre: e.target.value})} required disabled={isSaving}/>
                            </div>
                            <div className="form-group">
                                <label htmlFor="user-email">Email</label>
                                <input id="user-email" type="email" value={currentUser.email || ''} onChange={e => setCurrentUser({...currentUser, email: e.target.value})} required disabled={!!currentUser.id || isSaving} />
                            </div>
                             
                             {!currentUser.id && (
                                <div className="form-group">
                                    <label htmlFor="user-password">Contraseña</label>
                                    <input id="user-password" type="password" value={currentUser.password || ''} onChange={e => setCurrentUser({...currentUser, password: e.target.value})} required minLength={6} disabled={isSaving}/>
                                </div>
                             )}

                             {currentUser.id && (
                                <div className="form-group">
                                    <label htmlFor="user-new-password">Nueva Contraseña (opcional)</label>
                                    <input 
                                        id="user-new-password" type="password" value={currentUser.newPassword || ''}
                                        onChange={e => setCurrentUser({...currentUser, newPassword: e.target.value})}
                                        minLength={6} placeholder="Dejar en blanco para no cambiar"
                                        disabled={isSaving}
                                    />
                                </div>
                             )}
                            <div className="form-group">
                                <label htmlFor="user-role">Rol</label>
                                <select id="user-role" value={currentUser.rol || 'Empleado'} onChange={e => setCurrentUser({...currentUser, rol: e.target.value as UserRole})} required disabled={!isOwner || isSaving}>
                                    {roleOptions.map(role => <option key={role} value={role}>{role}</option>)}
                                </select>
                            </div>
                             <div className="form-group">
                                <label htmlFor="user-branch">Sucursal</label>
                                <select id="user-branch" value={currentUser.id_Sucursal || ''} onChange={e => setCurrentUser({...currentUser, id_Sucursal: e.target.value ? parseInt(e.target.value, 10) : undefined})} disabled={!isOwner || isSaving} >
                                    <option value="">Sin Asignar</option>
                                    {branches.map(branch => (
                                        <option key={branch.id} value={branch.id}>{branch.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" onClick={closeModal} className="btn btn--danger" disabled={isSaving}>Cancelar</button>
                            <button type="submit" className="btn btn--primary" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default UsersPage;