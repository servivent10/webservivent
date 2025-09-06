/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import Modal from '../components/Modal';
import { SalesPageProps, Sale, Branch, Product, ProductForSale } from '../types';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../utils/formatting';
import './SalesPage.css';
import '../components/Table.css';
import '../components/Button.css';

const SalesPage: React.FC<SalesPageProps> = ({ profile }) => {
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    const canManage = profile?.rol === 'Propietario' || profile?.rol === 'Administrador';

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('Ventas')
            .select('*, sucursal:Sucursales(nombre:Nombre), usuario:Usuarios(nombre:Nombre)')
            .order('fecha_venta', { ascending: false });

        if (error) {
            addToast(`Error al cargar ventas: ${error.message}`, 'error');
        } else {
            setSales(data as unknown as Sale[]);
        }
        setLoading(false);
    }, [addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (loading) return <p>Cargando ventas...</p>;

    return (
        <div className="sales-page">
            <div className="table-shared-container">
                 <table className="sales-page__table table-shared" aria-label="Tabla de ventas">
                    <thead>
                        <tr>
                            <th>Folio</th>
                            <th>Sucursal</th>
                            <th>Vendedor</th>
                            <th>Fecha</th>
                            <th>Método de Pago</th>
                            <th>Total</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sales.length > 0 ? sales.map(sale => (
                             <tr key={sale.id}>
                                <td>VENTA-{String(sale.id).padStart(6, '0')}</td>
                                <td>{sale.sucursal?.nombre || 'N/A'}</td>
                                <td>{sale.usuario?.nombre || 'N/A'}</td>
                                <td>{new Date(sale.fecha_venta).toLocaleDateString()}</td>
                                <td>{sale.metodo_pago || 'N/A'}</td>
                                <td>{formatCurrency(sale.monto_total)}</td>
                                <td>
                                    <button className="btn-icon" aria-label={`Ver detalles de la venta ${sale.id}`}><span className="material-icons">visibility</span></button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center' }}>No se han registrado ventas.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SalesPage;