/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { PurchasesPageProps, Purchase, Branch, AppUser } from '../types';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../utils/formatting';
import './PurchasesPage.css';
import '../components/Table.css';
import '../components/Button.css';

const PurchasesPage: React.FC<PurchasesPageProps> = ({ profile, onPurchaseSelect }) => {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const { addToast } = useToast();

    // New State for UI/Filtering
    const [branches, setBranches] = useState<Branch[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [expandedBranchId, setExpandedBranchId] = useState<number | null>(null);

    const canManage = profile?.rol === 'Propietario' || profile?.rol === 'Administrador';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const purchasesPromise = supabase
                .from('Compras')
                .select('*, proveedor:Proveedores(nombre:Nombre), sucursal:Sucursales(nombre:Nombre), usuario:Usuarios(nombre:Nombre)')
                .order('fecha_compra', { ascending: false });
            
            const branchesPromise = supabase.from('Sucursales').select('id, nombre: Nombre').order('Nombre');
            
            const usersPromise = supabase.from('Usuarios').select('id, nombre: Nombre, id_Sucursal').not('rol', 'is', null).order('Nombre');

            const [purchasesResult, branchesResult, usersResult] = await Promise.all([purchasesPromise, branchesPromise, usersPromise]);

            if (purchasesResult.error) throw purchasesResult.error;
            if (branchesResult.error) throw branchesResult.error;
            if (usersResult.error) throw usersResult.error;

            setPurchases(purchasesResult.data as unknown as Purchase[]);
            setBranches(branchesResult.data as Branch[]);
            setUsers(usersResult.data as AppUser[]);

        } catch (error: any) {
            addToast(`Error al cargar datos: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const counts = useMemo(() => {
        const branchCounts: { [key: number]: number } = {};
        const userCounts: { [key: string]: number } = {};
        
        purchases.forEach(p => {
            if (p.id_sucursal) {
                branchCounts[p.id_sucursal] = (branchCounts[p.id_sucursal] || 0) + 1;
            }
            if (p.id_usuario) {
                userCounts[p.id_usuario] = (userCounts[p.id_usuario] || 0) + 1;
            }
        });
        return { branchCounts, userCounts };
    }, [purchases]);

    const usersByBranch = useMemo(() => {
        const grouped: { [key: number]: AppUser[] } = {};
        users.forEach(user => {
            if (user.id_Sucursal) {
                if (!grouped[user.id_Sucursal]) {
                    grouped[user.id_Sucursal] = [];
                }
                grouped[user.id_Sucursal].push(user);
            }
        });
        return grouped;
    }, [users]);
    
    const filteredPurchases = useMemo(() => {
        return purchases
            .filter(p => !selectedBranchId || p.id_sucursal === selectedBranchId)
            .filter(p => !selectedUserId || p.id_usuario === selectedUserId)
            .filter(p => {
                if (!searchTerm.trim()) return true;
                const lower = searchTerm.toLowerCase();
                return (
                    (p.folio || '').toLowerCase().includes(lower) ||
                    (p.proveedor?.nombre || '').toLowerCase().includes(lower) ||
                    (p.usuario?.nombre || '').toLowerCase().includes(lower)
                );
            });
    }, [purchases, selectedBranchId, selectedUserId, searchTerm]);

    const groupedPurchases = useMemo(() => {
        const groups: { [key: string]: { purchases: Purchase[]; total: number } } = {};

        const sortedPurchases = [...filteredPurchases].sort((a, b) => new Date(b.fecha_compra).getTime() - new Date(a.fecha_compra).getTime());

        sortedPurchases.forEach(p => {
            const date = new Date(p.fecha_compra);
            const dateKey = date.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            if (!groups[dateKey]) {
                groups[dateKey] = { purchases: [], total: 0 };
            }
            groups[dateKey].purchases.push(p);
            groups[dateKey].total += p.monto_total;
        });

        return groups;
    }, [filteredPurchases]);

    const handleSelectAll = () => {
        setSelectedBranchId(null);
        setSelectedUserId(null);
        setExpandedBranchId(null);
    };

    const handleBranchClick = (branchId: number) => {
        setSelectedUserId(null);
        const isDeselecting = selectedBranchId === branchId;
        
        setSelectedBranchId(isDeselecting ? null : branchId);
        setExpandedBranchId(isDeselecting ? null : branchId);
    };
    
    const handleUserClick = (e: React.MouseEvent, userId: string) => {
        e.stopPropagation();
        setSelectedUserId(prev => (prev === userId ? null : userId));
    };

    const handleNewPurchase = async () => {
        if (!profile || !profile.id || !profile.id_Sucursal) {
            addToast('No se puede crear una compra sin un perfil de usuario completo y una sucursal asignada.', 'error');
            return;
        }
        setIsCreating(true);
        try {
            const { count, error: countError } = await supabase
                .from('Compras')
                .select('*', { count: 'exact', head: true });

            if (countError) throw countError;

            const newFolioNumber = (count || 0) + 1;
            const folio = `COMPRA-${String(newFolioNumber).padStart(6, '0')}`;
            
            const { data, error } = await supabase
                .from('Compras')
                .insert({
                    folio: folio,
                    id_sucursal: profile.id_Sucursal,
                    id_usuario: profile.id,
                    monto_total: 0,
                    estado: 'Pendiente',
                    fecha_compra: new Date().toISOString(),
                    estado_pago: 'Pago Pendiente',
                    condicion_pago: 'Contado',
                })
                .select('id')
                .single();

            if (error) throw error;
            
            addToast('Borrador de compra creado.', 'success');
            onPurchaseSelect(data.id);

        } catch (error: any) {
            addToast(`Error al crear la compra: ${error.message}`, 'error');
        } finally {
            setIsCreating(false);
        }
    };
    
    const renderStatusIcon = (status: Purchase['estado']) => {
        const statusInfo = {
            'Pendiente': { icon: 'schedule', colorClass: 'status-icon--pending', title: 'Pendiente' },
            'Confirmado': { icon: 'check_circle', colorClass: 'status-icon--confirmed', title: 'Confirmado' },
            'Cancelada': { icon: 'cancel', colorClass: 'status-icon--cancelled', title: 'Cancelada' },
        };
        const info = statusInfo[status] || statusInfo['Pendiente'];
        return (
            <span className={`material-icons purchases-page__status-icon ${info.colorClass}`} title={info.title}>
                {info.icon}
            </span>
        );
    };
    
    const renderPaymentStatusBadge = (status?: Purchase['estado_pago']) => {
        const currentStatus = status || 'Pago Pendiente';

        const statusInfo: Record<NonNullable<Purchase['estado_pago']>, { icon: string, className: string }> = {
            'Pago Pendiente': { icon: 'hourglass_empty', className: 'payment-status--pending' },
            'Parcialmente Pagado': { icon: 'star', className: 'payment-status--partial' },
            'Pagado': { icon: 'check_circle', className: 'payment-status--paid' },
        };

        const info = statusInfo[currentStatus];

        return (
            <span className={`purchases-page__payment-status ${info.className}`}>
                <span className="material-icons">{info.icon}</span>
                {currentStatus}
            </span>
        );
    };


    if (loading) return <p>Cargando compras...</p>;

    return (
        <div className="purchases-page">
            <aside className="purchases-page__sidebar">
                <ul className="purchases-page__filter-list">
                    <li
                        className={`purchases-page__filter-item ${!selectedBranchId ? 'purchases-page__filter-item--active' : ''}`}
                        onClick={handleSelectAll}
                    >
                        <span>Todas las Compras</span>
                        <span className="purchases-page__count-badge">{purchases.length}</span>
                    </li>
                    {branches.map(branch => (
                        <li
                            key={branch.id}
                            className={`purchases-page__filter-item ${selectedBranchId === branch.id ? 'purchases-page__filter-item--active' : ''}`}
                            onClick={() => handleBranchClick(branch.id)}
                        >
                            <span>{branch.nombre}</span>
                            <span className="purchases-page__count-badge">{counts.branchCounts[branch.id] || 0}</span>
                            
                            {expandedBranchId === branch.id && usersByBranch[branch.id] && (
                                <ul className="purchases-page__sub-list">
                                    {usersByBranch[branch.id].map(user => (
                                        <li
                                            key={user.id}
                                            className={`purchases-page__sub-item ${selectedUserId === user.id ? 'purchases-page__sub-item--active' : ''}`}
                                            onClick={(e) => handleUserClick(e, user.id)}
                                        >
                                            <span>{user.nombre}</span>
                                            <span className="purchases-page__count-badge">{counts.userCounts[user.id] || 0}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            </aside>
            <div className="purchases-page__main-content">
                <div className="purchases-page__toolbar">
                    <div className="purchases-page__search-container">
                        <span className="material-icons">search</span>
                        <input
                            type="search"
                            placeholder="Buscar por Folio, Proveedor, Usuario..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {canManage && (
                        <button onClick={handleNewPurchase} className="btn btn--primary" disabled={isCreating}>
                            <span className="material-icons">add_shopping_cart</span>
                            {isCreating ? 'Creando...' : 'Nueva Compra'}
                        </button>
                    )}
                </div>
                <div className="table-shared-container">
                     <table className="purchases-page__table table-shared" aria-label="Tabla de compras">
                        <thead>
                            <tr>
                                <th>Folio</th>
                                <th>Proveedor</th>
                                <th>Creado por</th>
                                <th>Condición</th>
                                <th>Estado Pago</th>
                                <th style={{ textAlign: 'right' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                             {Object.keys(groupedPurchases).length > 0 ? (
                                Object.entries(groupedPurchases).map(([date, group]) => (
                                    <React.Fragment key={date}>
                                        <tr className="table-group-header purchases-page__group-header">
                                            <td colSpan={6}>
                                                <div className="purchases-page__group-header-content">
                                                    <span className="purchases-page__group-date">{date}</span>
                                                    <span className="purchases-page__daily-total-badge">
                                                        Total del día: {formatCurrency(group.total)}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        {group.purchases.map(purchase => (
                                            <tr key={purchase.id} onClick={() => onPurchaseSelect(purchase.id)} className="table-row--clickable">
                                                <td>
                                                    <div className="purchases-page__folio-cell">
                                                        {renderStatusIcon(purchase.estado)}
                                                        <span>{purchase.folio || `COMPRA-${String(purchase.id).padStart(6, '0')}`}</span>
                                                    </div>
                                                </td>
                                                <td>{purchase.proveedor?.nombre || <span style={{color: 'var(--text-secondary)'}}>No asignado</span>}</td>
                                                <td>{purchase.usuario?.nombre || 'N/A'}</td>
                                                <td>{purchase.condicion_pago}</td>
                                                <td>{renderPaymentStatusBadge(purchase.estado_pago)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(purchase.monto_total)}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center' }}>No se encontraron compras con los filtros actuales.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PurchasesPage;