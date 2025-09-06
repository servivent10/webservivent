/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import ProviderAvatar from '../components/ProviderAvatar';
import Modal from '../components/Modal';
import { Provider, ProvidersPageProps } from '../types';
import { useToast } from '../contexts/ToastContext';
import './ProvidersPage.css';
import '../components/Table.css';
import '../components/Button.css';

const ProvidersPage: React.FC<ProvidersPageProps> = ({ profile }) => {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentProvider, setCurrentProvider] = useState<Partial<Provider> | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    
    // Estados para el modal de confirmación de eliminación
    const [providerToDelete, setProviderToDelete] = useState<Provider | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const { addToast } = useToast();

    const canManage = profile?.rol === 'Propietario' || profile?.rol === 'Administrador';

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('Proveedores')
            .select('id, nombre: Nombre, contacto_nombre: Contacto_nombre, contacto_email: Contacto_email, contacto_telefono: Contacto_telefono, direccion: Direccion, logo_url: Logo_url, created_at')
            .order('Nombre', { ascending: true });

        if (error) {
            addToast(`Error al cargar proveedores: ${error.message}`, 'error');
        } else {
            setProviders(data as unknown as Provider[]);
        }
        setLoading(false);
    }, [addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    const cleanupModalState = () => {
        setIsModalOpen(false);
        setCurrentProvider(null);
        setLogoFile(null);
        setLogoPreview(null);
        setIsSaving(false);
    };

    const openModal = (provider: Provider | null = null) => {
        if (!canManage) return;
        if (provider) {
            setCurrentProvider({ ...provider });
            setLogoPreview(provider.logo_url);
        } else {
            setCurrentProvider({ 
                nombre: '', 
                contacto_nombre: '',
                contacto_email: '',
                contacto_telefono: '',
                direccion: '',
                logo_url: null
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        cleanupModalState();
    };
    
    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!currentProvider || !currentProvider.nombre) {
            addToast("El nombre del proveedor es obligatorio.", 'error');
            return;
        }
        
        setIsSaving(true);
        
        try {
            let logoPublicUrl = currentProvider.logo_url || null;

            if (logoFile) {
                const fileExt = logoFile.name.split('.').pop();
                const filePath = `public/${currentProvider.nombre!.replace(/\s+/g, '-')}-${Date.now()}.${fileExt}`;
                
                const { error: uploadError } = await supabase.storage
                    .from('proveedores-logos')
                    .upload(filePath, logoFile, { upsert: true });

                if (uploadError) throw new Error(`Error al subir el logo: ${uploadError.message}`);

                const { data: urlData } = supabase.storage.from('proveedores-logos').getPublicUrl(filePath);
                logoPublicUrl = `${urlData.publicUrl}?t=${new Date().getTime()}`;
            }

            const providerPayload = {
                Nombre: currentProvider.nombre,
                Contacto_nombre: currentProvider.contacto_nombre || null,
                Contacto_email: currentProvider.contacto_email || null,
                Contacto_telefono: currentProvider.contacto_telefono || null,
                Direccion: currentProvider.direccion || null,
                Logo_url: logoPublicUrl
            };

            if (currentProvider.id) {
                const { error } = await supabase.from('Proveedores').update(providerPayload).eq('id', currentProvider.id);
                if (error) throw error;
                addToast('Proveedor actualizado correctamente.', 'success');
            } else {
                const { error } = await supabase.from('Proveedores').insert(providerPayload);
                if (error) throw error;
                addToast('Proveedor creado correctamente.', 'success');
            }
            
            cleanupModalState();
            fetchData();

        } catch (error: any) {
            addToast(`Error al guardar: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClick = (provider: Provider) => {
        setProviderToDelete(provider);
    };

    const confirmDelete = async () => {
        if (!providerToDelete) return;

        setIsDeleting(true);
        try {
            const RLS_ERROR_MESSAGE = "Error de Permisos: No tienes autorización para eliminar este proveedor.";
            
            const { data, error } = await supabase
                .from('Proveedores')
                .delete()
                .eq('id', providerToDelete.id)
                .select();

            if (error) throw error;
            if (!data || data.length === 0) throw new Error(RLS_ERROR_MESSAGE);
    
            addToast(`Proveedor "${providerToDelete.nombre}" eliminado con éxito.`, 'success');
            fetchData();
        } catch (error: any) {
            addToast(`Error al eliminar: ${error.message}`, 'error');
        } finally {
            setIsDeleting(false);
            setProviderToDelete(null);
        }
    };


    if (loading) return <p>Cargando proveedores...</p>;

    return (
        <div className="providers-page">
            {canManage && (
                <div className="providers-page__actions">
                    <button onClick={() => openModal()} className="btn btn--primary">
                        <span className="material-icons">add</span>
                        Añadir Proveedor
                    </button>
                </div>
            )}
            <div className="table-shared-container">
                <table className="providers-page__table table-shared" aria-label="Tabla de proveedores">
                    <thead>
                        <tr>
                            <th>Proveedor</th>
                            <th>Contacto</th>
                            <th>Teléfono</th>
                            <th>Email</th>
                            {canManage && <th>Acciones</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {providers.map(provider => (
                            <tr key={provider.id}>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <ProviderAvatar providerName={provider.nombre} logoUrl={provider.logo_url} />
                                        {provider.nombre}
                                    </div>
                                </td>
                                <td>{provider.contacto_nombre || 'N/A'}</td>
                                <td>{provider.contacto_telefono || 'N/A'}</td>
                                <td>{provider.contacto_email || 'N/A'}</td>
                                {canManage && (
                                    <td>
                                        <button onClick={() => openModal(provider)} className="btn-icon" aria-label={`Editar ${provider.nombre}`}><span className="material-icons">edit</span></button>
                                        <button onClick={() => handleDeleteClick(provider)} className="btn-icon" aria-label={`Eliminar ${provider.nombre}`}><span className="material-icons">delete</span></button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {canManage && isModalOpen && currentProvider && (
                <Modal 
                    title={currentProvider.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                    onClose={closeModal}
                    className="providers-page__modal"
                >
                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                             <div className="providers-page__modal-grid">
                                <div className="providers-page__logo-upload-section">
                                    <ProviderAvatar 
                                        providerName={currentProvider.nombre || '?'} 
                                        logoUrl={logoPreview || currentProvider.logo_url || null} 
                                    />
                                    <div className="form-group">
                                        <label htmlFor="provider-logo">Logo del Proveedor</label>
                                        <input 
                                            id="provider-logo" 
                                            type="file" 
                                            accept="image/png, image/jpeg, image/webp" 
                                            onChange={handleLogoChange}
                                            disabled={isSaving}
                                        />
                                    </div>
                                </div>
                                <div className="providers-page__modal-form-fields">
                                    <div className="form-group">
                                        <label htmlFor="provider-name">Nombre del Proveedor</label>
                                        <input id="provider-name" type="text" value={currentProvider.nombre || ''} onChange={e => setCurrentProvider({...currentProvider, nombre: e.target.value})} required disabled={isSaving}/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="provider-contact-name">Nombre de Contacto</label>
                                        <input id="provider-contact-name" type="text" value={currentProvider.contacto_nombre || ''} onChange={e => setCurrentProvider({...currentProvider, contacto_nombre: e.target.value})} disabled={isSaving}/>
                                    </div>
                                    <div className="providers-page__form-row">
                                        <div className="form-group">
                                            <label htmlFor="provider-phone">Teléfono de Contacto</label>
                                            <input id="provider-phone" type="tel" value={currentProvider.contacto_telefono || ''} onChange={e => setCurrentProvider({...currentProvider, contacto_telefono: e.target.value})} disabled={isSaving}/>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="provider-email">Email de Contacto</label>
                                            <input id="provider-email" type="email" value={currentProvider.contacto_email || ''} onChange={e => setCurrentProvider({...currentProvider, contacto_email: e.target.value})} disabled={isSaving}/>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="provider-address">Dirección</label>
                                        <textarea id="provider-address" value={currentProvider.direccion || ''} onChange={e => setCurrentProvider({...currentProvider, direccion: e.target.value})} rows={2} disabled={isSaving}></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" onClick={closeModal} className="btn btn--danger" disabled={isSaving}>Cancelar</button>
                            <button type="submit" className="btn btn--primary" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {providerToDelete && (
                <Modal
                    title="Confirmar Eliminación"
                    onClose={() => setProviderToDelete(null)}
                >
                    <div className="modal-body">
                        <p>¿Está seguro de que desea eliminar al proveedor "<strong>{providerToDelete.nombre}</strong>"?</p>
                        <p>Esta acción no se puede deshacer.</p>
                    </div>
                    <div className="modal-footer">
                        <button type="button" onClick={() => setProviderToDelete(null)} className="btn btn--secondary" disabled={isDeleting}>
                            Cancelar
                        </button>
                        <button type="button" onClick={confirmDelete} className="btn btn--danger" disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default ProvidersPage;