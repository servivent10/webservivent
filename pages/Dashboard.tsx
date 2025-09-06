/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const [productCount, setProductCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProductCount = async () => {
            setLoading(true);
            const { count, error } = await supabase
                .from('Productos')
                .select('*', { count: 'exact', head: true });
            
            if (error) {
                console.error("Error fetching product count:", error);
            } else {
                setProductCount(count || 0);
            }
            setLoading(false);
        };

        fetchProductCount();
    }, []);

    return (
        <div className="dashboard">
            <div className="dashboard__card-container">
                <div className="dashboard__summary-card">
                    <span className="material-icons dashboard__card-icon">attach_money</span>
                    <div className="dashboard__card-info">
                        <h3>Ventas de Hoy</h3>
                        <p>Bs.1,850.25</p>
                    </div>
                </div>
                <div className="dashboard__summary-card">
                    <span className="material-icons dashboard__card-icon">inventory_2</span>
                    <div className="dashboard__card-info">
                        <h3>Total Productos</h3>
                        <p>{loading ? '...' : productCount}</p>
                    </div>
                </div>
                <div className="dashboard__summary-card">
                    <span className="material-icons dashboard__card-icon">groups</span>
                    <div className="dashboard__card-info">
                        <h3>Nuevos Clientes</h3>
                        <p>12</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;