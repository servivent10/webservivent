/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { ProductWithTotalStock, ProductsPageProps, Product } from '../types';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import { formatCurrency } from '../utils/formatting';
import './ProductsPage.css';
import '../components/Table.css';
import '../components/Button.css';

const ProductsPage: React.FC<ProductsPageProps> = ({ profile, onProductSelect }) => {
    const [products, setProducts] = useState<ProductWithTotalStock[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Este estado ahora solo se usa para el producto *nuevo*
    const [newProduct, setNewProduct] = useState<Partial<Product> | null>(null);
    const [imageFiles, setImageFiles] = useState<(File | null)[]>([null, null, null]);
    const [imagePreviews, setImagePreviews] = useState<(string | null)[]>([null, null, null]);
    
    // Estados para los filtros y la UI de la barra lateral
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'categories' | 'brands'>('categories');


    const { addToast } = useToast();
    
    const canManageProducts = profile?.rol === 'Propietario' || profile?.rol === 'Administrador';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const productsPromise = supabase.from('Productos')
                .select('id, sku: SKU, nombre: Nombre, modelo: Modelo, marca: Marca, categoria: Categoria, descripcion: Descripcion, precio_base: Precio_base, imagenes: Imagenes, created_at')
                .order('Nombre', { ascending: true });
            const inventoryPromise = supabase.from('Inventario').select('id_producto, cantidad');

            const [{ data: productsData, error: productsError }, { data: inventoryData, error: inventoryError }] = await Promise.all([productsPromise, inventoryPromise]);

            if (productsError) throw productsError;
            if (inventoryError) throw inventoryError;

            const stockMap = new Map<number, number>();
            inventoryData.forEach(item => {
                const currentStock = stockMap.get(item.id_producto) || 0;
                stockMap.set(item.id_producto, currentStock + item.cantidad);
            });

            const productsWithStock: ProductWithTotalStock[] = (productsData as unknown as Product[]).map(product => ({
                ...product,
                stock_total: stockMap.get(product.id) || 0,
            }));
            
            setProducts(productsWithStock);

        } catch (error: any) {
            addToast(`Error al cargar datos: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    // --- LÓGICA DE FILTRADO Y CATEGORIZACIÓN (MEMOIZED) ---

    const categories = useMemo(() => {
        const categoryCounts: { [key: string]: number } = {};
        products.forEach(product => {
            const category = product.categoria || 'Sin Categoría';
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });
        return categoryCounts;
    }, [products]);
    
    const brands = useMemo(() => {
        const brandCounts: { [key: string]: number } = {};
        products.forEach(product => {
            const brand = product.marca || 'Sin Marca';
            brandCounts[brand] = (brandCounts[brand] || 0) + 1;
        });
        return brandCounts;
    }, [products]);

    const totalProductsInAllCategories = useMemo(() => {
        return Object.values(categories).reduce((sum, count) => sum + count, 0);
    }, [categories]);

    const filteredProducts = useMemo(() => {
        return products
            .filter(p => {
                // Filtro de Categoría
                if (!selectedCategory) return true;
                return (p.categoria || 'Sin Categoría') === selectedCategory;
            })
            .filter(p => {
                // Filtro de Marcas
                if (selectedBrands.length === 0) return true;
                return selectedBrands.includes(p.marca || 'Sin Marca');
            })
            .filter(p => {
                // Filtro de Búsqueda Inteligente
                if (!searchTerm) return true;
                const lowercasedTerm = searchTerm.toLowerCase();
                return (
                    p.nombre.toLowerCase().includes(lowercasedTerm) ||
                    p.sku.toLowerCase().includes(lowercasedTerm) ||
                    (p.marca && p.marca.toLowerCase().includes(lowercasedTerm)) ||
                    (p.modelo && p.modelo.toLowerCase().includes(lowercasedTerm))
                );
            });
    }, [products, selectedCategory, selectedBrands, searchTerm]);
    
     const handleBrandChange = (brand: string) => {
        setSelectedBrands(prev =>
            prev.includes(brand)
                ? prev.filter(b => b !== brand)
                : [...prev, brand]
        );
    };

    // --- MANEJO DEL MODAL (CRUD) ---

    const cleanupModalState = () => {
        setIsModalOpen(false);
        setNewProduct(null);
        setImageFiles([null, null, null]);
        setImagePreviews([null, null, null]);
    };
    
    const openCreateModal = () => {
        setNewProduct({ 
            sku: '', nombre: '', modelo: '', marca: '', categoria: '', descripcion: '', precio_base: 0, imagenes: []
        });
        setImagePreviews([null, null, null]);
        setImageFiles([null, null, null]);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        cleanupModalState();
    };
    
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const newFiles = [...imageFiles];
            newFiles[index] = file;
            setImageFiles(newFiles);

            const newPreviews = [...imagePreviews];
            newPreviews[index] = URL.createObjectURL(file);
            setImagePreviews(newPreviews);
        }
    };
    
    const removeImage = (index: number) => {
        const newFiles = [...imageFiles];
        newFiles[index] = null;
        setImageFiles(newFiles);

        const newPreviews = [...imagePreviews];
        newPreviews[index] = null;
        setImagePreviews(newPreviews);
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!newProduct || !newProduct.nombre || !newProduct.sku) {
            addToast("SKU y Nombre son obligatorios.", 'error');
            return;
        }
        setIsSaving(true);
        
        try {
            const finalImageUrls: (string | null)[] = [...imagePreviews];

            // Subir archivos nuevos y obtener sus URLs
            const uploadPromises = imageFiles.map(async (file, index) => {
                if (!file) return; // Solo procesar archivos nuevos
                const fileExt = file.name.split('.').pop();
                const filePath = `public/${newProduct.sku}-img${index}-${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('productos')
                    .upload(filePath, file, { upsert: true });
                
                if (uploadError) throw new Error(`Error al subir la imagen #${index + 1}: ${uploadError.message}`);

                const { data: urlData } = supabase.storage.from('productos').getPublicUrl(filePath);
                finalImageUrls[index] = urlData.publicUrl; // Actualizar la URL en la posición correcta
            });

            await Promise.all(uploadPromises);

            const cleanUrls = finalImageUrls
                .filter(url => url && !url.startsWith('blob:'))
                .map(url => url!.split('?')[0]);

            const productPayload = {
                SKU: newProduct.sku,
                Nombre: newProduct.nombre,
                Modelo: newProduct.modelo || null,
                Marca: newProduct.marca || null,
                Categoria: newProduct.categoria || null,
                Descripcion: newProduct.descripcion || null,
                Precio_base: newProduct.precio_base || 0,
                Imagenes: cleanUrls,
            };

            // La lógica de guardado aquí es solo para crear nuevos productos
            const { data: newProductData, error: productError } = await supabase.from('Productos').insert(productPayload).select('id, Nombre').single();
            if (productError) throw productError;

            const { data: branches, error: branchesError } = await supabase.from('Sucursales').select('id');
            if (branchesError) throw branchesError;

            if (branches && branches.length > 0) {
                const inventoryPayload = branches.map(branch => ({
                    id_producto: newProductData.id,
                    id_sucursal: branch.id,
                    cantidad: 0,
                    costo_promedio: 0, // Añadir costo promedio inicial
                }));
                const { error: inventoryError } = await supabase.from('Inventario').insert(inventoryPayload);
                if (inventoryError) {
                     addToast('Producto creado, pero falló la inicialización del inventario.', 'error');
                }
            }
            addToast(`Producto "${newProductData.Nombre}" creado correctamente.`, 'success');
            
            closeModal();
            fetchData();
        } catch (error: any) {
            addToast(`Error al guardar el producto: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (product: ProductWithTotalStock) => {
        if (window.confirm(`¿Está seguro de que desea eliminar el producto "${product.nombre}"? Esta acción no se puede deshacer.`)) {
            try {
                const { error } = await supabase.from('Productos').delete().eq('id', product.id);
                if (error) throw error;
                addToast(`Producto "${product.nombre}" eliminado.`, 'success');
                fetchData();
            } catch (error: any) {
                 addToast(`Error al eliminar: ${error.message}`, 'error');
            }
        }
    };

    const renderCoverImageUploader = () => (
        <div className="products-page__image-upload-container">
            <label>Imagen de Portada</label>
            <div className="products-page__image-preview products-page__image-preview--cover">
                {imagePreviews[0] ? (
                    <img src={imagePreviews[0]!} alt="Vista previa de portada" />
                ) : (
                    <span className="material-icons">add_a_photo</span>
                )}
            </div>
            <div className="products-page__image-actions">
                <input 
                    type="file" 
                    id="image-upload-0"
                    className="products-page__visually-hidden" 
                    accept="image/png, image/jpeg, image/webp"
                    onChange={(e) => handleImageChange(e, 0)}
                    disabled={isSaving}
                />
                <label htmlFor="image-upload-0" className="products-page__image-upload-label">
                    <span className="btn btn--secondary">
                        <span className="material-icons">upload</span>
                        Subir
                    </span>
                </label>
                {imagePreviews[0] && (
                    <button type="button" onClick={() => removeImage(0)} className="btn btn--danger" disabled={isSaving}>
                        <span className="material-icons">delete</span>
                        Quitar
                    </button>
                )}
            </div>
        </div>
    );
    
    const renderDetailImageUploader = (index: number) => (
        <div className="products-page__detail-image-uploader">
            <div className="products-page__image-preview products-page__image-preview--detail">
                {imagePreviews[index] ? (
                    <img src={imagePreviews[index]!} alt={`Vista previa de detalle ${index}`} />
                ) : (
                    <span className="material-icons">add_photo_alternate</span>
                )}
            </div>
            <div className="products-page__detail-image-info">
                <label>Imagen de Detalle {index}</label>
                <div className="products-page__image-actions">
                     <input 
                        type="file" 
                        id={`image-upload-${index}`}
                        className="products-page__visually-hidden" 
                        accept="image/png, image/jpeg, image/webp"
                        onChange={(e) => handleImageChange(e, index)}
                        disabled={isSaving}
                    />
                    <label htmlFor={`image-upload-${index}`} className="products-page__image-upload-label">
                        <span className="btn btn--secondary">
                            <span className="material-icons">upload</span>
                        </span>
                    </label>
                    {imagePreviews[index] && (
                        <button type="button" onClick={() => removeImage(index)} className="btn btn--danger" disabled={isSaving}>
                            <span className="material-icons">delete</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    if (loading) return <p>Cargando productos...</p>;

    return (
        <div className="products-page">
            <aside className="products-page__sidebar">
                <div className="products-page__sidebar-tabs">
                    <button
                        className={`products-page__sidebar-tab ${activeTab === 'categories' ? 'products-page__sidebar-tab--active' : ''} ${selectedCategory ? 'products-page__sidebar-tab--has-filter' : ''}`}
                        onClick={() => setActiveTab('categories')}
                    >
                        Categorías
                    </button>
                    <button
                        className={`products-page__sidebar-tab ${activeTab === 'brands' ? 'products-page__sidebar-tab--active' : ''} ${selectedBrands.length > 0 ? 'products-page__sidebar-tab--has-filter' : ''}`}
                        onClick={() => setActiveTab('brands')}
                    >
                        Marcas
                    </button>
                </div>
                <div className="products-page__sidebar-content">
                    {activeTab === 'categories' && (
                        <ul className="products-page__category-list">
                            <li
                                className={`products-page__category-item ${selectedCategory === null ? 'products-page__category-item--active' : ''}`}
                                onClick={() => setSelectedCategory(null)}
                            >
                                Todos los productos
                                <span className="products-page__category-count-badge">{totalProductsInAllCategories}</span>
                            </li>
                            {Object.entries(categories).map(([name, count]) => (
                                <li
                                    key={name}
                                    className={`products-page__category-item ${selectedCategory === name ? 'products-page__category-item--active' : ''}`}
                                    onClick={() => setSelectedCategory(name)}
                                >
                                    {name}
                                    <span className="products-page__category-count-badge">{count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {activeTab === 'brands' && (
                        <ul className="products-page__brand-list">
                            {Object.entries(brands).map(([name, count]) => (
                                <li key={name} className="products-page__brand-item">
                                    <input
                                        type="checkbox"
                                        id={`brand-${name}`}
                                        checked={selectedBrands.includes(name)}
                                        onChange={() => handleBrandChange(name)}
                                    />
                                    <label htmlFor={`brand-${name}`}>{name}</label>
                                    <span className="products-page__category-count-badge">{count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>
            <div className="products-page__main-content">
                 <div className="products-page__toolbar">
                    <div className="products-page__search-container">
                        <span className="material-icons">search</span>
                        <input
                            type="search"
                            placeholder="Buscar por SKU, Nombre, Marca..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {canManageProducts && (
                        <button onClick={openCreateModal} className="btn btn--primary">
                            <span className="material-icons">add</span>
                            Añadir Producto
                        </button>
                    )}
                </div>
                <div className="table-shared-container">
                    <table className="products-page__table table-shared" aria-label="Catálogo de Productos">
                        <thead>
                            <tr>
                                <th>Imagen</th>
                                <th>SKU</th>
                                <th>Nombre</th>
                                <th>Marca</th>
                                <th>Categoría</th>
                                <th>Precio Base</th>
                                <th>Stock Total</th>
                                {canManageProducts && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.map(product => (
                                <tr key={product.id} onClick={() => onProductSelect(product.id)} className="table-row--clickable">
                                    <td>
                                        {product.imagenes && product.imagenes.length > 0 ? (
                                            <img src={product.imagenes[0]} alt={product.nombre} className="products-page__thumbnail" />
                                        ) : (
                                            <div className="products-page__thumbnail-placeholder">
                                                <span className="material-icons">image_not_supported</span>
                                            </div>
                                        )}
                                    </td>
                                    <td>{product.sku}</td>
                                    <td>{product.nombre}</td>
                                    <td>{product.marca || 'N/A'}</td>
                                    <td>{product.categoria || 'N/A'}</td>
                                    <td>{formatCurrency(product.precio_base)}</td>
                                    <td>{product.stock_total}</td>
                                    {canManageProducts && (
                                        <td>
                                            <button onClick={(e) => { e.stopPropagation(); onProductSelect(product.id); }} className="btn-icon" aria-label={`Editar ${product.nombre}`}><span className="material-icons">edit</span></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(product); }} className="btn-icon" aria-label={`Eliminar ${product.nombre}`}><span className="material-icons">delete</span></button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {canManageProducts && isModalOpen && newProduct && (
                <Modal 
                    title="Nuevo Producto"
                    onClose={closeModal}
                    className="products-page__modal"
                >
                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                             <div className="products-page__modal-grid">
                                <div className="products-page__modal-image-section">
                                    {renderCoverImageUploader()}
                                    <div className="products-page__detail-images-container">
                                        {renderDetailImageUploader(1)}
                                        {renderDetailImageUploader(2)}
                                    </div>
                                </div>
                                <div className="products-page__modal-form-fields">
                                    <div className="form-group">
                                        <label htmlFor="prod-sku">SKU</label>
                                        <input id="prod-sku" type="text" value={newProduct.sku || ''} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} required disabled={isSaving} placeholder="(escanee qr, codigo de barra)"/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="prod-nombre">Nombre del Producto</label>
                                        <input id="prod-nombre" type="text" value={newProduct.nombre || ''} onChange={e => setNewProduct({...newProduct, nombre: e.target.value})} required disabled={isSaving}/>
                                    </div>
                                    <div className="products-page__form-row">
                                        <div className="form-group">
                                            <label htmlFor="prod-marca">Marca</label>
                                            <input id="prod-marca" type="text" value={newProduct.marca || ''} onChange={e => setNewProduct({...newProduct, marca: e.target.value})} disabled={isSaving}/>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="prod-modelo">Modelo</label>
                                            <input id="prod-modelo" type="text" value={newProduct.modelo || ''} onChange={e => setNewProduct({...newProduct, modelo: e.target.value})} disabled={isSaving}/>
                                        </div>
                                    </div>
                                    <div className="products-page__form-row">
                                        <div className="form-group">
                                            <label htmlFor="prod-categoria">Categoría</label>
                                            <input id="prod-categoria" type="text" value={newProduct.categoria || ''} onChange={e => setNewProduct({...newProduct, categoria: e.target.value})} disabled={isSaving}/>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="prod-precio">Precio Base</label>
                                            <input id="prod-precio" type="number" step="0.01" value={newProduct.precio_base || 0} onChange={e => setNewProduct({...newProduct, precio_base: parseFloat(e.target.value)})} required disabled={isSaving}/>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="prod-descripcion">Descripción</label>
                                        <textarea id="prod-descripcion" value={newProduct.descripcion || ''} onChange={e => setNewProduct({...newProduct, descripcion: e.target.value})} rows={3} disabled={isSaving}></textarea>
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
        </div>
    );
};

export default ProductsPage;