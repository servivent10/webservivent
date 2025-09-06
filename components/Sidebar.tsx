/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SidebarProps, Page } from '../types';
import './Sidebar.css';

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, profile, isOpen }) => {
    const navItems: { id: Page; icon: string; label: string }[] = [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
        { id: 'pos', icon: 'point_of_sale', label: 'Terminal de Venta' },
        { id: 'products', icon: 'inventory_2', label: 'Productos' },
        { id: 'sales', icon: 'receipt_long', label: 'Ventas' },
        { id: 'purchases', icon: 'shopping_cart', label: 'Compras' },
        { id: 'providers', icon: 'business', label: 'Proveedores' },
        { id: 'transfers', icon: 'sync_alt', label: 'Traspasos' },
        { id: 'expenses', icon: 'paid', label: 'Gastos' },
    ];

    const isOwner = profile?.rol === 'Propietario';

    return (
        <aside className={`sidebar ${isOpen ? 'sidebar--expanded' : ''}`}>
            <nav className="sidebar__nav">
                {navItems.map(item => (
                    <a
                        key={item.id}
                        className={`sidebar__nav-link ${currentPage === item.id ? 'sidebar__nav-link--active' : ''}`}
                        onClick={() => setCurrentPage(item.id)}
                        role="button"
                        aria-current={currentPage === item.id ? 'page' : undefined}
                        data-tooltip={item.label}
                    >
                        <span className="material-icons">{item.icon}</span>
                        <span className="sidebar__nav-label">{item.label}</span>
                    </a>
                ))}
            </nav>
        </aside>
    );
};

export default Sidebar;