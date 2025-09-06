/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { AppUser } from '../types';
import './LoginPage.css';
import '../components/Button.css';

export const LoginPage: React.FC = () => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const passwordInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            const { data, error } = await supabase.from('Usuarios').select('id, nombre: Nombre, email: Email, avatar_link: Avatar_link');
            if (error) {
                console.error('Error fetching users:', error.message, error);
                setError('No se pudieron cargar los usuarios.');
            } else {
                setUsers(data as AppUser[]);
                if (data.length > 0) {
                    setSelectedUserId(data[0].id);
                }
            }
        };
        fetchUsers();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const selectedUser = users.find(u => u.id === selectedUserId);
        if (!selectedUser) {
            setError('Por favor, seleccione un usuario.');
            setLoading(false);
            return;
        }

        const { error } = await supabase.auth.signInWithPassword({
            email: selectedUser.email,
            password: password,
        });

        if (error) {
            setError('Contraseña incorrecta.');
        }
        // En caso de éxito, el componente principal App detectará el cambio de sesión y se volverá a renderizar.
        setLoading(false);
    };

    const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedUserId(e.target.value);
        passwordInputRef.current?.focus();
    };

    return (
        <div className="login-page">
            <div className="login-page__card">
                <h1 className="login-page__title">ServiVENT</h1>
                <h2 className="login-page__subtitle">Iniciar Sesión</h2>
                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label htmlFor="user-select">Usuario</label>
                        <select id="user-select" value={selectedUserId} onChange={handleUserChange} required>
                            {users.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.nombre}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Contraseña</label>
                        <input
                            id="password"
                            type="password"
                            ref={passwordInputRef}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && <p className="error-message">{error}</p>}
                    <button type="submit" className="btn btn--primary" disabled={loading}>
                        {loading ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>
            </div>
        </div>
    );
};