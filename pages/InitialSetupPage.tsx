/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';

import './InitialSetupPage.css';
import '../components/Button.css';

export const InitialSetupPage: React.FC<{ onSetupComplete: () => void }> = ({ onSetupComplete }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [branchName, setBranchName] = useState('');
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userPassword, setUserPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            let authUser: User | null = null;

            // Paso 1: Registrar o iniciar sesión del usuario.
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: userEmail,
                password: userPassword,
                options: {
                    data: { nombre: userName }
                }
            });

            if (signUpError) {
                if (signUpError.message === 'User already registered') {
                    // El usuario existe, así que intentamos iniciar su sesión.
                    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                        email: userEmail,
                        password: userPassword,
                    });

                    if (signInError) {
                        throw new Error("Este correo ya está registrado, pero la contraseña es incorrecta. Por favor, verifíquela.");
                    }
                    if (!signInData.user) throw new Error("No se pudo iniciar sesión con el usuario existente.");
                    authUser = signInData.user;
                } else {
                    // Ocurrió un error diferente durante el registro.
                    throw signUpError;
                }
            } else {
                if (!signUpData.user) throw new Error("No se pudo crear el usuario.");
                authUser = signUpData.user;
            }

            // En este punto, tenemos un usuario válido (authUser).

            // Paso 2: Crear la sucursal (Sucursal).
            const { data: branchData, error: branchError } = await supabase
                .from('Sucursales')
                .insert({ Nombre: branchName })
                .select()
                .single();

            if (branchError) {
                // Si la creación de la sucursal falla, debemos cerrar la sesión del usuario para evitar un estado inconsistente.
                await supabase.auth.signOut();
                throw branchError;
            }

            // Paso 3: Crear el perfil de usuario en la tabla pública 'Usuarios'.
            // Hacemos un 'insert' explícito porque el trigger que creaba el perfil
            // ha sido eliminado para mejorar la estabilidad.
            const { error: profileError } = await supabase
                .from('Usuarios')
                .insert({
                    id: authUser.id,
                    Nombre: userName,
                    Email: userEmail,
                    id_Sucursal: branchData.id,
                    rol: 'Propietario'
                });

            if (profileError) {
                // Si la creación del perfil falla, cerrar sesión y mostrar el error.
                await supabase.auth.signOut();
                throw profileError;
            }

            // Si todo es exitoso, cerrar sesión para forzar un inicio de sesión en la página principal.
            await supabase.auth.signOut();
            alert("¡Configuración completada! Ahora puede iniciar sesión.");
            onSetupComplete();

        } catch (err: any) {
            const errorMessage = err.error_description || err.message;
            if (errorMessage.includes('unique constraint "Usuarios_Email_key"')) {
                 setError('Este correo electrónico ya está en uso. Por favor, utilice otro.');
            } else {
                 setError(errorMessage);
            }
            console.error("Setup failed:", errorMessage, err);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="initial-setup">
            <div className="initial-setup__card">
                 <h1 className="initial-setup__title">Bienvenido a ServiVENT</h1>
                <h2 className="initial-setup__subtitle">Configuración Inicial</h2>
                <p className="initial-setup__description">
                    Parece que es la primera vez que inicia la aplicación. Por favor, cree la primera sucursal y el usuario propietario.
                </p>
                <form onSubmit={handleSubmit} className="initial-setup__form">
                    <fieldset className="initial-setup__fieldset">
                        <legend className="initial-setup__legend">Datos de la Sucursal</legend>
                         <div className="form-group">
                            <label htmlFor="branch-name">Nombre de la Sucursal</label>
                            <input id="branch-name" type="text" value={branchName} onChange={e => setBranchName(e.target.value)} required />
                        </div>
                    </fieldset>
                    <fieldset className="initial-setup__fieldset">
                        <legend className="initial-setup__legend">Datos del Usuario Propietario</legend>
                         <div className="form-group">
                            <label htmlFor="user-name">Nombre Completo</label>
                            <input id="user-name" type="text" value={userName} onChange={e => setUserName(e.target.value)} required />
                        </div>
                         <div className="form-group">
                            <label htmlFor="user-email">Email</label>
                            <input id="user-email" type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} required />
                        </div>
                         <div className="form-group">
                            <label htmlFor="user-password">Contraseña</label>
                            <input id="user-password" type="password" value={userPassword} onChange={e => setUserPassword(e.target.value)} required minLength={6} />
                        </div>
                    </fieldset>
                    {error && <p className="error-message">{error}</p>}
                    <button type="submit" className="btn btn--primary" disabled={loading}>
                        {loading ? 'Guardando...' : 'Completar Configuración'}
                    </button>
                </form>
            </div>
        </div>
    );
};