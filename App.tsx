/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// FIX: Corrected React import statement for useState and useEffect.
import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { AppUser, Page } from './types';
import './App.css';

// Componentes de Página
import { LoginPage } from './pages/LoginPage';
import { InitialSetupPage } from './pages/InitialSetupPage';
import Dashboard from './pages/Dashboard';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import BranchesPage from './pages/BranchesPage';
import UsersPage from './pages/UsersPage';
import ProvidersPage from './pages/ProvidersPage';
import PurchasesPage from './pages/PurchasesPage';
import PurchaseDetailPage from './pages/PurchaseDetailPage'; // Nueva página
import SalesPage from './pages/SalesPage';
import TerminalVentaPage from './pages/TerminalVentaPage';

// Componentes de Layout (Estructura)
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/ToastContainer';

// --- ESTRUCTURA PRINCIPAL DE LA APP ---

interface MainAppLayoutProps {
    session: Session;
    profile: AppUser | null;
}

const MainAppLayout: React.FC<MainAppLayoutProps> = ({ session, profile }) => {
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [viewingProductId, setViewingProductId] = useState<number | null>(null);
    const [viewingPurchaseId, setViewingPurchaseId] = useState<number | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const handleProductSelect = (id: number) => {
        setViewingProductId(id);
    };

    const handleBackToProducts = () => {
        setViewingProductId(null);
    };

    const handlePurchaseSelect = (id: number) => {
        setViewingPurchaseId(id);
    };

    const handleBackToPurchases = () => {
        setViewingPurchaseId(null);
    };

    // Al cambiar de página del menú principal, reseteamos la vista de detalle
    const handleSetCurrentPage = (page: Page) => {
        setViewingProductId(null);
        setViewingPurchaseId(null);
        setCurrentPage(page);
    };
    
    const handleToggleSidebar = () => {
        setIsSidebarOpen(prev => !prev);
    };

    const renderPage = () => {
        switch (currentPage) {
            case 'dashboard':
                return <Dashboard />;
            case 'products':
                 return viewingProductId ? (
                    <ProductDetailPage 
                        productId={viewingProductId} 
                        onBack={handleBackToProducts} 
                        profile={profile}
                    />
                ) : (
                    <ProductsPage 
                        profile={profile} 
                        onProductSelect={handleProductSelect} 
                    />
                );
            case 'branches':
                if (profile?.rol !== 'Propietario') {
                    return <p>Acceso denegado. No tienes permiso para ver esta página.</p>;
                }
                return <BranchesPage profile={profile} />;
            case 'users':
                return <UsersPage profile={profile} />;
            case 'providers':
                return <ProvidersPage profile={profile} />;
            case 'purchases':
                return viewingPurchaseId ? (
                    <PurchaseDetailPage
                        purchaseId={viewingPurchaseId}
                        onBack={handleBackToPurchases}
                        profile={profile}
                    />
                ) : (
                    <PurchasesPage
                        profile={profile}
                        onPurchaseSelect={handlePurchaseSelect}
                    />
                );
            case 'sales':
                return <SalesPage profile={profile} />;
            case 'pos':
                return <TerminalVentaPage profile={profile} />;
            default:
                return <p>Página no encontrada.</p>;
        }
    };
    
    const getPageTitle = (page: Page): string => {
        const titles: Record<Page, string> = {
            dashboard: 'Dashboard',
            products: 'Catálogo de Productos',
            sales: 'Historial de Ventas',
            purchases: 'Gestión de Compras',
            providers: 'Gestión de Proveedores',
            transfers: 'Traspasos',
            expenses: 'Gastos',
            branches: 'Gestión de Sucursales',
            users: 'Gestión de Usuarios',
            pos: 'Terminal de Venta',
        };
        // Lógica para cambiar el título si estamos en una vista de detalle
        if (page === 'products' && viewingProductId) return 'Detalle del Producto';
        if (page === 'purchases' && viewingPurchaseId) return '';
        
        return titles[page];
    };
    
    const pageTitle = getPageTitle(currentPage);

    return (
        <div className="app-layout">
            <Header 
                user={session.user} 
                profile={profile} 
                setCurrentPage={handleSetCurrentPage}
                onToggleSidebar={handleToggleSidebar}
            />
            <div className="app-layout__content-wrapper">
                <Sidebar 
                    currentPage={currentPage} 
                    setCurrentPage={handleSetCurrentPage} 
                    profile={profile}
                    isOpen={isSidebarOpen}
                />
                <main className="app-layout__main-content">
                    {pageTitle && (
                        <div className="app-layout__page-header">
                            <h1>{pageTitle}</h1>
                        </div>
                    )}
                    <div className="app-layout__page-content">
                        {renderPage()}
                    </div>
                </main>
            </div>
        </div>
    );
};


// --- COMPONENTE RAÍZ DE LA APP ---

const App: React.FC = () => {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<AppUser | null>(null);
    const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [key, setKey] = useState(0); // Añadimos una key para forzar la re-verificación

    useEffect(() => {
        // Verificar el estado de la configuración inicial
        const checkSetup = async () => {
            // Verificar si existe al menos una sucursal y un usuario.
            const { count: branchCount, error: branchError } = await supabase.from('Sucursales').select('*', { count: 'exact', head: true });
            const { count: userCount, error: userError } = await supabase.from('Usuarios').select('*', { count: 'exact', head: true });
            
            const error = branchError || userError;
            if (error) {
                console.error("Error checking setup:", error.message, error);
                // Manejar el caso donde las tablas podrían no existir aún, se asume que la configuración es necesaria
                setIsSetupComplete(false);
            } else {
                setIsSetupComplete(branchCount !== null && branchCount > 0 && userCount !== null && userCount > 0);
            }
        };

        checkSetup();

        // Escuchar cambios de autenticación
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [key]);
    
     useEffect(() => {
        const fetchProfile = async () => {
            if (session?.user) {
                const { data, error } = await supabase
                    .from('Usuarios')
                    .select('id, nombre: Nombre, email: Email, avatar_link: Avatar_link, rol, id_Sucursal, sucursal: Sucursales(nombre: Nombre)')
                    .eq('id', session.user.id)
                    .single();
                
                if (error && error.code !== 'PGRST116') { // PGRST116 significa que no se encontraron filas
                    console.error('Error fetching profile:', error.message, error);
                    setProfile(null);
                } else if (data) {
                    setProfile(data as unknown as AppUser);
                } else {
                    setProfile(null); // No se encontró perfil, lo cual es un caso válido
                }
                 setLoading(false);
            } else {
                setProfile(null);
                // Solo establecer 'loading' a false si no estamos en fase de verificación de configuración
                if(isSetupComplete !== null) {
                    setLoading(false);
                }
            }
        };
        
        if (session) {
            fetchProfile();
        } else {
             // Si no hay sesión, podemos detener la carga si conocemos el estado de la configuración
            if (isSetupComplete !== null) {
                setLoading(false);
            }
        }
    }, [session, isSetupComplete]);
    
    const renderContent = () => {
        if (loading || isSetupComplete === null) {
            return <div className="loading-container">Cargando...</div>;
        }

        if (!isSetupComplete) {
            return <InitialSetupPage onSetupComplete={() => setKey(k => k + 1)} />;
        }
        
        if (!session) {
            return <LoginPage />;
        }

        return <MainAppLayout session={session} profile={profile} />;
    };

    return (
        <ToastProvider>
            {renderContent()}
            <ToastContainer />
        </ToastProvider>
    );
};

export default App;