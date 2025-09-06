/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Branch, AppUser } from '../types';
import Modal from '../components/Modal';
import { useToast } from '../contexts/ToastContext';
import './BranchesPage.css';
import '../components/Table.css';
import '../components/Button.css';

interface BranchesPageProps {
    profile: AppUser | null;
}

const BranchesPage: React.FC<BranchesPageProps> = ({ profile }) => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentBranch, setCurrentBranch] = useState<Partial<Branch> | null>(null);
    const { addToast } = useToast();

    const isOwner = profile?.rol === 'Propietario';
    const canManage = profile?.rol === 'Propietario' || profile?.rol === 'Administrador';

    const fetchBranches = useCallback(async () => {
        setLoading(true);
        // Gracias a RLS, esta consulta devolverá todas las sucursales para el Propietario,
        // y solo la sucursal asignada para Administradores y Empleados.
        const { data, error } = await supabase
            .from('Sucursales')
            .select('id, nombre:Nombre, direccion:Direccion, telefono:Telefono')
            .order('Nombre', { ascending: true });

        if (error) {
            console.error("Error fetching branches:", error.message, error);
            addToast(`No se pudieron cargar las sucursales: ${error.message}`, 'error');
        } else {
            setBranches(data as Branch[]);
        }
        setLoading(false);
    }, [addToast]);

    useEffect(() => {
        fetchBranches();
    }, [fetchBranches]);

    const openModal = (branch: Branch | null = null) => {
        setCurrentBranch(branch ? { ...branch } : { nombre: '', direccion: '', telefono: '' });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setCurrentBranch(null);
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!currentBranch || !currentBranch.nombre) {
            addToast("El nombre de la sucursal es obligatorio.", 'error');
            return;
        }

        try {
            const branchData = {
                Nombre: currentBranch.nombre,
                Direccion: currentBranch.direccion,
                Telefono: currentBranch.telefono
            };
            
            let data, error;
            const RLS_ERROR_MESSAGE = "Error de Permisos: La base de datos bloqueó la operación. Verifique las políticas de seguridad (RLS).";

            if (currentBranch.id) {
                // Actualizar
                ({ data, error } = await supabase
                    .from('Sucursales')
                    .update(branchData)
                    .eq('id', currentBranch.id)
                    .select());
                if (error) throw error;
                if (!data || data.length === 0) throw new Error(RLS_ERROR_MESSAGE);
                addToast('Sucursal actualizada correctamente.', 'success');
            } else {
                // Crear
                ({ data, error } = await supabase
                    .from('Sucursales')
                    .insert(branchData)
                    .select());
                if (error) throw error;
                if (!data || data.length === 0) throw new Error(RLS_ERROR_MESSAGE);
                 addToast('Sucursal creada correctamente.', 'success');
            }

            closeModal();
            fetchBranches();

        } catch (error: any) {
            console.error("Error saving branch:", error.message, error);
            addToast(error.message, 'error');
        }
    };

    const handleDelete = async (branch: Branch) => {
        if (window.confirm(`¿Está seguro de que desea eliminar la sucursal "${branch.nombre}"?`)) {
             try {
                const RLS_ERROR_MESSAGE = "Error de Permisos: La base de datos bloqueó la eliminación. Verifique las políticas de seguridad (RLS).";
                const { data, error } = await supabase
                    .from('Sucursales')
                    .delete()
                    .eq('id', branch.id)
                    .select();

                if (error) throw error;
                if (!data || data.length === 0) throw new Error(RLS_ERROR_MESSAGE);

                addToast(`Sucursal "${branch.nombre}" eliminada.`, 'success');
                fetchBranches();
            } catch (error: any) {
                console.error("Error deleting branch:", error.message, error);
                addToast(error.message, 'error');
            }
        }
    };

    if (loading) return <p>Cargando sucursales...</p>;

    return (
        <div className="branches-page">
            {isOwner && (
                <div className="branches-page__actions">
                    <button onClick={() => openModal()} className="btn btn--primary">
                        <span className="material-icons">add</span>
                        Añadir Sucursal
                    </button>
                </div>
            )}
            <div className="table-shared-container">
                <table className="branches-page__table table-shared" aria-label="Tabla de sucursales">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Dirección</th>
                            <th>Teléfono</th>
                            {canManage && <th>Acciones</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {branches.map(branch => (
                            <tr key={branch.id}>
                                <td>{branch.nombre}</td>
                                <td>{branch.direccion || 'N/A'}</td>
                                <td>{branch.telefono || 'N/A'}</td>
                                {canManage && (
                                    <td>
                                        <button onClick={() => openModal(branch)} className="btn-icon" aria-label={`Editar ${branch.nombre}`}><span className="material-icons">edit</span></button>
                                        {isOwner && (
                                            <button onClick={() => handleDelete(branch)} className="btn-icon" aria-label={`Eliminar ${branch.nombre}`}><span className="material-icons">delete</span></button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {canManage && isModalOpen && currentBranch && (
                <Modal 
                    title={currentBranch.id ? 'Editar Sucursal' : 'Nueva Sucursal'}
                    onClose={closeModal}
                >
                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                            <div className="form-group">
                                <label htmlFor="branch-name">Nombre</label>
                                <input id="branch-name" type="text" value={currentBranch.nombre || ''} onChange={e => setCurrentBranch({...currentBranch, nombre: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label htmlFor="branch-address">Dirección</label>
                                <input id="branch-address" type="text" value={currentBranch.direccion || ''} onChange={e => setCurrentBranch({...currentBranch, direccion: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="branch-phone">Teléfono</label>
                                <input id="branch-phone" type="tel" value={currentBranch.telefono || ''} onChange={e => setCurrentBranch({...currentBranch, telefono: e.target.value})} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" onClick={closeModal} className="btn btn--danger">Cancelar</button>
                            <button type="submit" className="btn btn--primary">Guardar</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default BranchesPage;