/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback, useMemo, useRef, KeyboardEvent } from 'react';
import { supabase } from '../supabaseClient';
import { Purchase, Product, Provider, PurchaseDetailPageProps, PurchaseItem, Payment } from '../types';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import PaymentsModal from '../components/PaymentsModal'; // Importar el nuevo modal
import { formatCurrency } from '../utils/formatting';
import './PurchaseDetailPage.css';
import '../components/Button.css';

interface PurchaseItemWithProduct extends PurchaseItem {
    producto: {
        id: number;
        sku: string;
        nombre: string;
    }
}


const PurchaseDetailPage: React.FC<PurchaseDetailPageProps> = ({ purchaseId, onBack, profile }) => {
    const [purchase, setPurchase] = useState<Purchase | null>(null);
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItemWithProduct[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const { addToast } = useToast();
    const debounceTimers = useRef<{ [key: string]: number }>({});

    // Estados para la gestión de proveedores
    const [allProviders, setAllProviders] = useState<Provider[]>([]);
    const [providerSearchTerm, setProviderSearchTerm] = useState('');
    const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
    const [highlightedProviderIndex, setHighlightedProviderIndex] = useState(-1);
    const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
    const providerRef = useRef<HTMLDivElement>(null);
    const providerDropdownRef = useRef<HTMLUListElement>(null);

    // Estados para el modal de nuevo producto
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    const [newProduct, setNewProduct] = useState<Partial<Product> | null>(null);
    const [imageFiles, setImageFiles] = useState<(File | null)[]>([null, null, null]);
    const [imagePreviews, setImagePreviews] = useState<(string | null)[]>([null, null, null]);
    
    // Estados para el flujo de confirmación
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isReceiving, setIsReceiving] = useState(false);

    // Estado para el modal de pagos
    const [isPaymentsModalOpen, setIsPaymentsModalOpen] = useState(false);

    // Estado para la edición del tipo de cambio
    const [editingExchangeRate, setEditingExchangeRate] = useState<string | null>(null);

    const canManage = profile?.rol === 'Propietario' || profile?.rol === 'Administrador';

    const fetchPurchaseData = useCallback(async (shouldReloadItems = true) => {
        try {
            const purchasePromise = supabase
                .from('Compras')
                .select('*, proveedor:Proveedores(nombre:Nombre), sucursal:Sucursales(nombre:Nombre), usuario:Usuarios(nombre:Nombre), fecha_vencimiento, condicion_pago, estado_pago')
                .eq('id', purchaseId)
                .single();

            const promises: any[] = [purchasePromise];

            if (shouldReloadItems) {
                promises.push(
                    supabase
                        .from('Detalles_Compra')
                        .select('*, moneda, producto:Productos(id, sku:SKU, nombre:Nombre)')
                        .eq('id_compra', purchaseId)
                );
            }
            
            const [purchaseResult, itemsResult] = await Promise.all(promises);

            if (purchaseResult.error) throw purchaseResult.error;

            const loadedPurchase = purchaseResult.data as unknown as Purchase;
            loadedPurchase.tipo_cambio = loadedPurchase.tipo_cambio || 1.00;
            loadedPurchase.condicion_pago = loadedPurchase.condicion_pago || 'Contado';
            loadedPurchase.estado_pago = loadedPurchase.estado_pago || 'Pago Pendiente';
            setPurchase(loadedPurchase);
            
            if (shouldReloadItems) {
                 if (itemsResult.error) throw itemsResult.error;
                 setPurchaseItems((itemsResult.data as any) || []);
            }

        } catch (error: any) {
            addToast(`Error al cargar la compra: ${error.message}`, 'error');
            setPurchase(null);
        }
    }, [purchaseId, addToast]);
    
    const fetchAllProducts = useCallback(async () => {
        const { data, error } = await supabase
            .from('Productos')
            .select('id, sku: SKU, nombre: Nombre, modelo: Modelo, marca: Marca, categoria: Categoria, descripcion: Descripcion, precio_base: Precio_base, imagenes: Imagenes, created_at')
            .order('Nombre');
            
        if (error) {
            addToast(`Error al cargar catálogo: ${error.message}`, 'error');
        } else {
            setProducts(data as unknown as Product[]);
        }
    }, [addToast]);
    
    const fetchAllProviders = useCallback(async () => {
        const { data, error } = await supabase
            .from('Proveedores')
            .select('id, nombre: Nombre, contacto_nombre: Contacto_nombre, contacto_email: Contacto_email, contacto_telefono: Contacto_telefono, direccion: Direccion, logo_url: Logo_url, created_at')
            .order('Nombre');

        if (error) {
            addToast(`Error al cargar proveedores: ${error.message}`, 'error');
        } else {
            setAllProviders(data as unknown as Provider[]);
        }
    }, [addToast]);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([fetchPurchaseData(), fetchAllProducts(), fetchAllProviders()]);
        } catch (error) {
            // Los errores se manejan en las funciones individuales
        } finally {
            setLoading(false);
        }
    }, [fetchPurchaseData, fetchAllProducts, fetchAllProviders]);

    useEffect(() => {
        fetchAllData();
         return () => {
            // Limpiar todos los temporizadores al desmontar el componente
            Object.values(debounceTimers.current).forEach(clearTimeout);
        };
    }, [fetchAllData]);
    
    // --- LÓGICA DE FILTRADO Y MEMOIZACIÓN ---
    
    const isPurchaseLocked = useMemo(() => purchase?.estado !== 'Pendiente', [purchase]);
    
    const filteredProducts = useMemo(() => {
        if (!searchTerm) return products;
        const lowercasedTerm = searchTerm.toLowerCase();
        return products.filter(p => 
            (p.nombre || '').toLowerCase().includes(lowercasedTerm) ||
            (p.sku || '').toLowerCase().includes(lowercasedTerm)
        );
    }, [products, searchTerm]);

    const filteredProviders = useMemo(() => {
        if (!providerSearchTerm) return allProviders;
        const lowercasedTerm = providerSearchTerm.toLowerCase();
        return allProviders.filter(p => (p.nombre || '').toLowerCase().includes(lowercasedTerm));
    }, [allProviders, providerSearchTerm]);
    
    const purchaseTotal = useMemo(() => {
        const exchangeRate = purchase?.tipo_cambio || 1;
        return purchaseItems.reduce((total, item) => {
            const costInBaseCurrency = item.moneda === '$'
                ? item.costo_unitario * exchangeRate
                : item.costo_unitario;
            return total + (item.cantidad * costInBaseCurrency);
        }, 0);
    }, [purchaseItems, purchase?.tipo_cambio]);

    const addedProductIds = useMemo(() => new Set(purchaseItems.map(item => item.producto.id)), [purchaseItems]);
    
    // --- LÓGICA DE ANCHO INTELIGENTE PARA INPUTS ---
    const maxCantidadLength = useMemo(() => {
        const lengths = purchaseItems.map(item => String(item.cantidad || 0).length);
        return Math.max(3, ...lengths);
    }, [purchaseItems]);

    const maxCostoLength = useMemo(() => {
        const lengths = purchaseItems.map(item => String(item.costo_unitario || 0).length);
        return Math.max(5, ...lengths);
    }, [purchaseItems]);
    
    const cantidadInputStyle = { width: `calc(${maxCantidadLength}ch + 1.5rem)` };
    const costoInputStyle = { width: `calc(${maxCostoLength}ch + 1.5rem)` };

    
    // --- GESTIÓN DE LA COMPRA (CABECERA) ---

    const handlePurchaseUpdate = useCallback(async (updates: Partial<Purchase>) => {
        if (!purchase) return;
        const { error } = await supabase
            .from('Compras')
            .update(updates)
            .eq('id', purchaseId);
        
        if (error) {
            addToast(`Error al actualizar: ${error.message}`, 'error');
            fetchPurchaseData(false); // Revertir en caso de error
        }
    }, [purchase, purchaseId, addToast, fetchPurchaseData]);
    
     const debouncedPurchaseUpdate = useCallback((key: string, updates: Partial<Purchase>) => {
        if (debounceTimers.current[key]) {
            clearTimeout(debounceTimers.current[key]);
        }
        debounceTimers.current[key] = window.setTimeout(() => {
            handlePurchaseUpdate(updates);
        }, 800);
    }, [handlePurchaseUpdate]);
    
    const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!purchase || isPurchaseLocked) return;
        const newDate = e.target.value;

        // Si se selecciona una fecha, la condición de pago debe ser 'Crédito'.
        // Si se borra la fecha (aunque esto es raro en los selectores nativos), mantenemos 'Crédito'
        // para evitar cambios de estado inesperados. El usuario puede volver a "Contado" explícitamente.
        if (newDate) {
            const updates: Partial<Purchase> = {
                fecha_vencimiento: newDate,
                condicion_pago: 'Crédito'
            };

            setPurchase(prev => prev ? { ...prev, ...updates } : null);
            handlePurchaseUpdate(updates);
        }
    };


    const handleConditionChange = (newCondition: 'Contado' | 'Crédito') => {
        if (!purchase || isPurchaseLocked) return;

        const updates: Partial<Purchase> = { condicion_pago: newCondition };
        if (newCondition === 'Contado') {
            updates.fecha_vencimiento = null;
        }

        setPurchase(prev => prev ? { ...prev, ...updates } : null);
        handlePurchaseUpdate(updates);
    };

    // --- GESTIÓN DE ITEMS DE LA COMPRA (DETALLE) ---

    const handleAddItem = async (product: Product) => {
        if (!purchase) return;

        const { data, error } = await supabase
            .from('Detalles_Compra')
            .insert({
                id_compra: purchase.id,
                id_producto: product.id,
                cantidad: 1,
                costo_unitario: 0,
                moneda: 'Bs.'
            })
            .select('*, moneda, producto:Productos(id, sku:SKU, nombre:Nombre)')
            .single();

        if (error) {
            addToast(`Error al añadir producto: ${error.message}`, 'error');
        } else {
            setPurchaseItems(prev => [...prev, data as PurchaseItemWithProduct]);
        }
    };
    
    const handleUpdateItem = (productId: number, field: 'cantidad' | 'costo_unitario' | 'moneda', value: number | string) => {
        setPurchaseItems(prevItems =>
            prevItems.map(item =>
                item.id_producto === productId ? { ...item, [field]: value } : item
            )
        );

        const debounceKey = `item-${productId}-${field}`;
        if (debounceTimers.current[debounceKey]) {
            clearTimeout(debounceTimers.current[debounceKey]);
        }
        debounceTimers.current[debounceKey] = window.setTimeout(async () => {
            const { error } = await supabase
                .from('Detalles_Compra')
                .update({ [field]: value })
                .match({ id_compra: purchaseId, id_producto: productId });
            if (error) {
                addToast(`Error al actualizar item: ${error.message}`, 'error');
                fetchPurchaseData();
            }
        }, 800);
    };

    const handleDeleteItem = async (productId: number) => {
        const { error } = await supabase
            .from('Detalles_Compra')
            .delete()
            .match({ id_compra: purchaseId, id_producto: productId });

        if (error) {
            addToast(`Error al eliminar producto: ${error.message}`, 'error');
        } else {
            setPurchaseItems(prev => prev.filter(item => item.id_producto !== productId));
        }
    };
    
    useEffect(() => {
        if (purchase && purchase.monto_total !== purchaseTotal) {
            debouncedPurchaseUpdate('monto_total', { monto_total: purchaseTotal });
            setPurchase(p => p ? { ...p, monto_total: purchaseTotal } : null);
        }
    }, [purchaseTotal, purchase, debouncedPurchaseUpdate]);

    const handleSelectProvider = async (providerId: string) => {
        setPurchase(prev => prev ? { ...prev, id_proveedor: providerId } : null);
        handlePurchaseUpdate({ id_proveedor: providerId });
        setIsProviderDropdownOpen(false);
        setProviderSearchTerm('');
        await fetchPurchaseData();
    };
    
    const handleClearProvider = async () => {
        setPurchase(prev => prev ? { ...prev, id_proveedor: null, proveedor: undefined } : null);
        handlePurchaseUpdate({ id_proveedor: null });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (providerRef.current && !providerRef.current.contains(event.target as Node)) {
                setIsProviderDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- NAVEGACIÓN POR TECLADO PARA PROVEEDORES ---

    useEffect(() => {
        setHighlightedProviderIndex(-1);
    }, [providerSearchTerm]);

    useEffect(() => {
        if (providerDropdownRef.current && highlightedProviderIndex > -1) {
            const item = providerDropdownRef.current.children[highlightedProviderIndex] as HTMLLIElement;
            if (item) {
                item.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedProviderIndex]);

    const handleProviderKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (!isProviderDropdownOpen) return;

        // +1 for the "Añadir Nuevo Proveedor" option
        const itemsCount = filteredProviders.length + 1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedProviderIndex(prev => (prev + 1) % itemsCount);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedProviderIndex(prev => (prev - 1 + itemsCount) % itemsCount);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedProviderIndex > 0) {
                    const provider = filteredProviders[highlightedProviderIndex - 1];
                    handleSelectProvider(provider.id);
                } else if (highlightedProviderIndex === 0) {
                    addToast('Funcionalidad no implementada.', 'error');
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsProviderDropdownOpen(false);
                break;
            default:
                break;
        }
    };

    // --- LÓGICA DEL MODAL DE PRODUCTO ---

    const cleanupProductModal = () => {
        setIsProductModalOpen(false);
        setNewProduct(null);
        setImageFiles([null, null, null]);
        setImagePreviews([null, null, null]);
    };

    const openProductModal = () => {
        setNewProduct({ sku: '', nombre: '', precio_base: 0, imagenes: [] });
        setIsProductModalOpen(true);
    };

    const handleProductSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!newProduct || !newProduct.nombre || !newProduct.sku) {
            addToast("SKU y Nombre son obligatorios.", 'error'); return;
        }
        setIsSavingProduct(true);
        try {
            const { data: newProductData, error: productError } = await supabase.from('Productos').insert({
                SKU: newProduct.sku,
                Nombre: newProduct.nombre,
                Marca: newProduct.marca,
                Modelo: newProduct.modelo,
                Categoria: newProduct.categoria,
                Precio_base: newProduct.precio_base
            }).select('id, Nombre').single();
            if (productError) throw productError;
            
            const { data: branches, error: branchesError } = await supabase.from('Sucursales').select('id');
            if (branchesError) throw branchesError;

            if (branches?.length > 0) {
                const inventoryPayload = branches.map(b => ({ id_producto: newProductData.id, id_sucursal: b.id, cantidad: 0 }));
                const { error: inventoryError } = await supabase.from('Inventario').insert(inventoryPayload);
                if (inventoryError) addToast('Producto creado, pero falló inicialización de inventario.', 'error');
            }

            addToast(`Producto "${newProductData.Nombre}" creado exitosamente.`, 'success');
            cleanupProductModal();
            await fetchAllProducts();
        } catch (error: any) {
            addToast(`Error al crear producto: ${error.message}`, 'error');
        } finally {
            setIsSavingProduct(false);
        }
    };
    
    const handleDelete = async () => {
        if (!purchase) return;
        if (window.confirm(`¿Está seguro de que desea eliminar la compra "${purchase.folio || `ID ${purchase.id}`}"? Esta acción no se puede deshacer.`)) {
            try {
                const { error: deleteItemsError } = await supabase
                    .from('Detalles_Compra')
                    .delete()
                    .eq('id_compra', purchase.id);

                if (deleteItemsError) throw deleteItemsError;

                const { error: deletePurchaseError } = await supabase
                    .from('Compras')
                    .delete()
                    .eq('id', purchase.id);
                
                if (deletePurchaseError) throw deletePurchaseError;

                addToast('Compra eliminada correctamente.', 'success');
                onBack();
            } catch (error: any) {
                addToast(`Error al eliminar la compra: ${error.message}`, 'error');
            }
        }
    };

    const handleConfirmReceive = async () => {
        if (!purchase) return;
        setIsReceiving(true);
        try {
            const { error, data } = await supabase.functions.invoke('receive-purchase-stock', {
                body: { purchase_id: purchase.id },
            });

            if (error) {
                const functionError = data?.msg || error.message;
                throw new Error(functionError);
            }
            
            addToast('¡Productos recibidos y stock actualizado correctamente!', 'success');
            setIsConfirmModalOpen(false);
            await fetchPurchaseData();

        } catch (error: any) {
            addToast(`Error al procesar la recepción: ${error.message}`, 'error');
        } finally {
            setIsReceiving(false);
        }
    };
    
    const renderStatusIcon = (status: Purchase['estado']) => {
        const statusInfo = {
            'Pendiente': { icon: 'schedule', color: '#f59e0b', text: 'Pendiente' },
            'Confirmado': { icon: 'check_circle', color: '#16a34a', text: 'Confirmado' },
            'Cancelada': { icon: 'cancel', color: '#ef4444', text: 'Cancelada' },
        };
        const info = statusInfo[status] || statusInfo['Pendiente'];

        return (
            <div className="purchase-detail-page__status-icon" title={info.text} style={{ color: info.color }}>
                <span className="material-icons">{info.icon}</span>
            </div>
        );
    };
    
    const renderPaymentStatusIndicator = () => {
        if (!purchase) return null;

        const status = purchase.estado_pago || 'Pago Pendiente';
        let icon = 'hourglass_empty';
        let text = 'Pago Pendiente';
        let className = 'pending';

        if (status === 'Parcialmente Pagado') {
            icon = 'star_half';
            text = 'Parcialmente Pagado';
            className = 'partial';
        } else if (status === 'Pagado') {
            icon = 'check_circle';
            text = 'Pagado';
            className = 'paid';
        }

        return (
            <p className={`purchase-detail-page__payment-status-indicator purchase-detail-page__payment-status-indicator--${className}`}>
                <span className="material-icons">{icon}</span>
                {text}
            </p>
        );
    };

    if (loading) return <div className="loading-container">Cargando detalles de la compra...</div>;
    if (!purchase) return <div>Compra no encontrada. <a onClick={onBack} style={{cursor: 'pointer'}}>Volver a la lista.</a></div>;
    
    const renderProviderSelector = () => (
        <div ref={providerRef} className="purchase-detail-page__searchable-select">
            <input
                id="provider-search-input"
                type="text"
                value={providerSearchTerm || purchase.proveedor?.nombre || ''}
                onChange={e => {
                    setProviderSearchTerm(e.target.value);
                    setIsProviderDropdownOpen(true);
                }}
                onFocus={() => {
                    setProviderSearchTerm('');
                    setIsProviderDropdownOpen(true);
                }}
                placeholder="Buscar o seleccionar proveedor..."
                disabled={isPurchaseLocked}
                autoComplete="off"
                onKeyDown={handleProviderKeyDown}
            />
            {isProviderDropdownOpen && !isPurchaseLocked && (
                <ul ref={providerDropdownRef} className="purchase-detail-page__search-results">
                    <li
                        onClick={() => { addToast('Funcionalidad no implementada.', 'error'); }}
                        onMouseEnter={() => setHighlightedProviderIndex(0)}
                        className={highlightedProviderIndex === 0 ? 'purchase-detail-page__search-result--highlighted' : ''}
                    >
                        <span className="material-icons" style={{verticalAlign: 'bottom', marginRight: '8px'}}>add_circle</span>
                        Añadir Nuevo Proveedor
                    </li>
                    {filteredProviders.map((p, index) => (
                        <li
                            key={p.id}
                            onClick={() => handleSelectProvider(p.id)}
                            onMouseEnter={() => setHighlightedProviderIndex(index + 1)}
                            className={highlightedProviderIndex === index + 1 ? 'purchase-detail-page__search-result--highlighted' : ''}
                        >
                            {p.nombre}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
    
    return (
        <div className="purchase-detail-page">
            <div className="purchase-detail-page__header">
                <div className="purchase-detail-page__breadcrumbs">
                    <a onClick={onBack} style={{cursor: 'pointer'}}>Compras</a> / <span>{purchase.folio || `COMPRA-${String(purchase.id).padStart(6, '0')}`}</span>
                </div>
                {canManage && (
                    <div className="purchase-detail-page__actions">
                         {!isPurchaseLocked && (
                            <>
                                <button className="btn-icon" title="Editar Compra" aria-label="Editar Compra"><span className="material-icons">edit</span></button>
                                <button onClick={handleDelete} className="btn-icon" title="Eliminar Compra" aria-label="Eliminar Compra"><span className="material-icons">delete</span></button>
                            </>
                         )}
                         <button className="btn-icon" title="Imprimir" aria-label="Imprimir"><span className="material-icons">print</span></button>
                         {!isPurchaseLocked && (
                            <button onClick={() => setIsConfirmModalOpen(true)} className="btn btn--primary" disabled={purchaseItems.length === 0}>
                                <span className="material-icons">check_circle</span>
                                Confirmar Productos
                            </button>
                         )}
                    </div>
                )}
            </div>

            <div className="purchase-detail-page__container">
                <div className="purchase-detail-page__main-column">
                    <div className="purchase-detail-page__info-card">

                        <div className="purchase-detail-page__folio-container">
                            {renderStatusIcon(purchase.estado)}
                            <h2 className="purchase-detail-page__folio-title">{purchase.folio || `COMPRA-${String(purchase.id).padStart(6, '0')}`}</h2>
                        </div>

                        <div className="purchase-detail-page__meta-centered">
                             <div className="purchase-detail-page__info-pills">
                                <span className="purchase-detail-page__info-pill">Sucursal: <strong>{purchase.sucursal?.nombre || 'N/A'}</strong></span>
                                <span className="purchase-detail-page__info-pill">Fecha: <strong>{new Date(purchase.fecha_compra).toLocaleDateString()}</strong></span>
                                {purchase.usuario && (
                                    <span className="purchase-detail-page__info-pill">Creado por: <strong>{purchase.usuario.nombre}</strong></span>
                                )}
                            </div>
                        </div>

                        <div className="purchase-detail-page__provider-section">
                            <div className="purchase-detail-page__provider-layout">
                                <label htmlFor="provider-search-input">Proveedor</label>
                                <div className="purchase-detail-page__provider-input-wrapper">
                                    {canManage ? renderProviderSelector() : <span>{purchase.proveedor?.nombre || 'No Asignado'}</span>}
                                    {canManage && !isPurchaseLocked && purchase.id_proveedor && (
                                        <button onClick={handleClearProvider} className="btn-icon purchase-detail-page__clear-provider-btn" aria-label="Limpiar proveedor">
                                            <span className="material-icons">close</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="purchase-detail-page__payment-controls-wrapper">
                            <div className="purchase-detail-page__controls-bar">
                                <div className="purchase-detail-page__payment-group">
                                    <div className="purchase-detail-page__segmented-control">
                                        <button
                                            type="button"
                                            className={purchase.condicion_pago === 'Contado' ? 'active' : ''}
                                            onClick={() => handleConditionChange('Contado')}
                                            disabled={isPurchaseLocked}
                                        >
                                            Contado
                                        </button>
                                        <div className={`purchase-detail-page__credit-date-wrapper ${purchase.condicion_pago === 'Crédito' ? 'active' : ''} ${isPurchaseLocked ? 'disabled' : ''}`}>
                                            Crédito
                                            <input
                                                id="due-date-input"
                                                type="date"
                                                value={purchase.fecha_vencimiento ? purchase.fecha_vencimiento.split('T')[0] : ''}
                                                onChange={handleDueDateChange}
                                                disabled={isPurchaseLocked}
                                                className="purchase-detail-page__date-input-overlay"
                                                aria-label="Seleccionar fecha de vencimiento"
                                            />
                                        </div>
                                    </div>
                                    <div className="purchase-detail-page__exchange-rate-control">
                                        <span className="material-icons">currency_exchange</span>
                                        <label htmlFor="exchange-rate-input">TC</label>
                                        <input
                                            id="exchange-rate-input"
                                            type="text"
                                            inputMode="decimal"
                                            onFocus={(e) => {
                                                setEditingExchangeRate(String(purchase?.tipo_cambio ?? ''));
                                                e.target.select();
                                            }}
                                            onBlur={() => {
                                                const newRateString = editingExchangeRate;
                                                setEditingExchangeRate(null);
                                                if (newRateString === null) return;
                                                const newRate = parseFloat(newRateString);
                                                if (newRateString === '') {
                                                    if (purchase?.tipo_cambio !== undefined) {
                                                        setPurchase(prev => prev ? { ...prev, tipo_cambio: undefined } : null);
                                                        handlePurchaseUpdate({ tipo_cambio: null });
                                                    }
                                                } else if (!isNaN(newRate) && newRate >= 0) {
                                                    if (newRate !== purchase?.tipo_cambio) {
                                                        setPurchase(prev => prev ? { ...prev, tipo_cambio: newRate } : null);
                                                        handlePurchaseUpdate({ tipo_cambio: newRate });
                                                    }
                                                }
                                            }}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (/^\d*\.?\d*$/.test(value)) {
                                                    setEditingExchangeRate(value);
                                                }
                                            }}
                                            value={editingExchangeRate !== null
                                                ? editingExchangeRate
                                                : formatCurrency(purchase.tipo_cambio, 'Bs.')
                                            }
                                            disabled={isPurchaseLocked}
                                            className="purchase-detail-page__summary-input"
                                            aria-label="Tipo de cambio"
                                        />
                                    </div>
                                </div>
                                
                                <button
                                    className="purchase-detail-page__summary-item purchase-detail-page__summary-item--total"
                                    title="Gestionar Pagos"
                                    onClick={() => setIsPaymentsModalOpen(true)}
                                >
                                    <span className="material-icons">payment</span>
                                    <span className="purchase-detail-page__price-value purchase-detail-page__price-value--large">{formatCurrency(purchaseTotal)}</span>
                                </button>
                            </div>
                            
                            <div className="purchase-detail-page__indicators-bar">
                                {purchase.condicion_pago === 'Crédito' && purchase.fecha_vencimiento ? (
                                    <p className="purchase-detail-page__due-date-indicator">
                                        <span className="material-icons">event</span>
                                        Vence el {new Date(purchase.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}
                                    </p>
                                ) : <div />} {/* Spacer */}
                                
                                {renderPaymentStatusIndicator()}
                            </div>
                        </div>
                    </div>
                    
                    <div className="purchase-detail-page__items-section">
                        <div className="purchase-detail-page__section-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <h2 style={{ margin: 0 }}>Productos Comprados</h2>
                                <span className="purchase-detail-page__items-count-badge">{purchaseItems.length}</span>
                            </div>
                        </div>
                         <div className="purchase-detail-page__table-container">
                            <table className="purchase-detail-page__items-table">
                                <thead>
                                    <tr>
                                        <th>Producto</th>
                                        <th>Can</th>
                                        <th>Costo</th>
                                        <th>Subtotal</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchaseItems.length > 0 ? (
                                        purchaseItems.map(item => {
                                            const exchangeRate = purchase.tipo_cambio || 1;
                                            const subtotal = item.moneda === '$'
                                                ? (item.cantidad * item.costo_unitario * exchangeRate)
                                                : (item.cantidad * item.costo_unitario);
                                            return (
                                                <tr key={item.id_producto}>
                                                    <td>{item.producto?.nombre || 'Producto no encontrado'}</td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            className="purchase-detail-page__table-input"
                                                            style={cantidadInputStyle}
                                                            value={item.cantidad}
                                                            onChange={(e) => handleUpdateItem(item.id_producto, 'cantidad', parseInt(e.target.value) || 0)}
                                                            onFocus={(e) => e.target.select()}
                                                            min="1"
                                                            disabled={isPurchaseLocked}
                                                        />
                                                    </td>
                                                    <td>
                                                         <div className="purchase-detail-page__cost-input-container">
                                                            <button
                                                                type="button"
                                                                className="purchase-detail-page__currency-btn"
                                                                onClick={() => handleUpdateItem(item.id_producto, 'moneda', item.moneda === 'Bs.' ? '$' : 'Bs.')}
                                                                aria-label={`Cambiar moneda para ${item.producto?.nombre}`}
                                                                disabled={isPurchaseLocked}
                                                            >
                                                                {item.moneda}
                                                            </button>
                                                            <input
                                                                type="number"
                                                                className="purchase-detail-page__table-input"
                                                                style={costoInputStyle}
                                                                value={item.costo_unitario}
                                                                onChange={(e) => handleUpdateItem(item.id_producto, 'costo_unitario', parseFloat(e.target.value) || 0)}
                                                                onFocus={(e) => e.target.select()}
                                                                step="0.01"
                                                                min="0"
                                                                disabled={isPurchaseLocked}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="purchase-detail-page__table-price-display">{formatCurrency(subtotal)}</td>
                                                    <td>
                                                        {!isPurchaseLocked && (
                                                            <button
                                                                onClick={() => handleDeleteItem(item.id_producto)}
                                                                className="btn-icon"
                                                                aria-label={`Eliminar ${item.producto?.nombre}`}
                                                            >
                                                                <span className="material-icons">delete</span>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center' }}>Añada productos desde el catálogo.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {!isPurchaseLocked && (
                    <div className="purchase-detail-page__catalog-column">
                         <div className="purchase-detail-page__items-section">
                            <div className="purchase-detail-page__section-header">
                                <h2>Mis Productos</h2>
                                {canManage && <button onClick={openProductModal} className="btn btn--secondary">+ Productos</button>}
                            </div>
                             <div className="purchase-detail-page__toolbar">
                                <div className="purchase-detail-page__search-container">
                                    <span className="material-icons">search</span>
                                    <input
                                        type="search"
                                        placeholder="Buscar producto para añadir..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="purchase-detail-page__table-container purchase-detail-page__table-container--compact">
                                <table className="purchase-detail-page__items-table purchase-detail-page__items-table--compact">
                                    <thead>
                                        <tr>
                                            <th>Producto</th>
                                            <th>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProducts.length > 0 ? filteredProducts.map(product => {
                                            const isAdded = addedProductIds.has(product.id);
                                            return (
                                                <tr key={product.id}>
                                                    <td>
                                                        <strong>{product.sku}</strong> - {product.nombre}
                                                    </td>
                                                    <td>
                                                        <button 
                                                            onClick={() => !isAdded && handleAddItem(product)}
                                                            className={`btn-icon ${isAdded ? 'purchase-detail-page__add-btn--added' : ''}`}
                                                            aria-label={isAdded ? `${product.nombre} ya añadido` : `Añadir ${product.nombre}`}
                                                        >
                                                            <span className="material-icons">{isAdded ? 'check_circle' : 'add_circle'}</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan={2} style={{textAlign: 'center'}}>No se encontraron productos.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                         </div>
                    </div>
                )}
            </div>
            
            {canManage && isProductModalOpen && newProduct && (
                <Modal 
                    title="Nuevo Producto"
                    onClose={cleanupProductModal}
                >
                    <form onSubmit={handleProductSave}>
                        <div className="modal-body">
                            <div className="form-group">
                                <label htmlFor="prod-sku">SKU</label>
                                <input id="prod-sku" type="text" value={newProduct.sku || ''} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} required disabled={isSavingProduct} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="prod-nombre">Nombre del Producto</label>
                                <input id="prod-nombre" type="text" value={newProduct.nombre || ''} onChange={e => setNewProduct({...newProduct, nombre: e.target.value})} required disabled={isSavingProduct}/>
                            </div>
                            <div className="form-group">
                                <label htmlFor="prod-precio">Precio Base</label>
                                <input id="prod-precio" type="number" step="0.01" value={newProduct.precio_base || 0} onChange={e => setNewProduct({...newProduct, precio_base: parseFloat(e.target.value)})} required disabled={isSavingProduct}/>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" onClick={cleanupProductModal} className="btn btn--danger" disabled={isSavingProduct}>Cancelar</button>
                            <button type="submit" className="btn btn--primary" disabled={isSavingProduct}>{isSavingProduct ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {isConfirmModalOpen && (
                <Modal title="Confirmar Recepción de Productos" onClose={() => setIsConfirmModalOpen(false)}>
                    <div className="modal-body">
                        <p>Está a punto de finalizar esta compra. Esta acción es irreversible y hará lo siguiente:</p>
                        <ul style={{ listStylePosition: 'inside', paddingLeft: '1rem', marginBottom: '1rem' }}>
                            <li>Añadirá <strong>{purchaseItems.length} items</strong> al inventario de la sucursal <strong>{purchase?.sucursal?.nombre}</strong>.</li>
                            <li>Actualizará el costo promedio de los productos afectados.</li>
                            <li>La compra se marcará como <strong>'Confirmado'</strong> y ya no podrá ser editada.</li>
                        </ul>
                        <p>¿Desea continuar?</p>
                    </div>
                    <div className="modal-footer">
                        <button onClick={() => setIsConfirmModalOpen(false)} className="btn btn--danger" disabled={isReceiving}>Cancelar</button>
                        <button onClick={handleConfirmReceive} className="btn btn--primary" disabled={isReceiving}>
                            {isReceiving ? 'Procesando...' : 'Confirmar Productos'}
                        </button>
                    </div>
                </Modal>
            )}

            {isPaymentsModalOpen && purchase && (
                <PaymentsModal
                    purchase={purchase}
                    onClose={() => setIsPaymentsModalOpen(false)}
                    onPaymentsUpdate={fetchPurchaseData}
                />
            )}
        </div>
    );
};

export default PurchaseDetailPage;