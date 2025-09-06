/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Purchase, Payment, PaymentsModalProps, PaymentMethod } from '../types';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../utils/formatting';
import Modal from './Modal';
import './PaymentsModal.css';
import './Button.css';

const PaymentsModal: React.FC<PaymentsModalProps> = ({ purchase, onClose, onPaymentsUpdate }) => {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    // Form state
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState<PaymentMethod>('Efectivo');
    const [notes, setNotes] = useState('');
    const [change, setChange] = useState(0);

    const { addToast } = useToast();
    const paymentMethods: PaymentMethod[] = ['Efectivo', 'Transferencia', 'Tarjeta de Débito/Crédito', 'QR', 'Otro'];

    const totalPaid = useMemo(() => payments.reduce((sum, p) => sum + p.monto, 0), [payments]);
    const balanceDue = useMemo(() => purchase.monto_total - totalPaid, [purchase.monto_total, totalPaid]);
    const progress = useMemo(() => purchase.monto_total > 0 ? (totalPaid / purchase.monto_total) * 100 : 0, [totalPaid, purchase.monto_total]);
    
    const progressBarColorClass = useMemo(() => {
        if (progress < 40) return 'payments-modal__progress-bar-filled--red';
        if (progress < 80) return 'payments-modal__progress-bar-filled--yellow';
        return 'payments-modal__progress-bar-filled--green';
    }, [progress]);

    useEffect(() => {
        if (balanceDue > 0) {
            setAmount(balanceDue.toFixed(2));
        } else {
            setAmount('0.00');
        }
        setChange(0);
    }, [balanceDue]);

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('Pagos_Compra')
                .select('*')
                .eq('id_compra', purchase.id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setPayments(data as Payment[]);
        } catch (error: any) {
            addToast(`Error al cargar pagos: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [purchase.id, addToast]);

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);
    
    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newAmount = e.target.value;
        setAmount(newAmount);
        const numericAmount = parseFloat(newAmount);
        
        if (!isNaN(numericAmount) && numericAmount > 0 && balanceDue > 0 && numericAmount > balanceDue) {
            setChange(numericAmount - balanceDue);
        } else {
            setChange(0);
        }
    };

    const handleAddPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        const paymentAmount = parseFloat(amount);

        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            addToast('El monto del pago debe ser mayor a cero.', 'error');
            return;
        }
        if (!paymentDate || !method) {
            addToast('Por favor complete la fecha y el método de pago.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const { error, data } = await supabase.functions.invoke('registrar-pago-compra', {
                body: {
                    purchaseId: purchase.id,
                    amount: paymentAmount,
                    paymentDate: paymentDate,
                    method: method,
                    notes: notes || null
                }
            });

            if (error) {
                const functionError = data?.msg || error.message;
                throw new Error(functionError);
            }

            addToast('Pago añadido correctamente.', 'success');
            
            setNotes('');
            
            await fetchPayments();
            onPaymentsUpdate();

        } catch (error: any) {
            addToast(`Error al guardar el pago: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDeleteClick = (payment: Payment) => {
        setPaymentToDelete(payment);
    };

    const confirmDelete = async () => {
        console.log("[DEBUG] confirmDelete: La función ha comenzado.");
        if (!paymentToDelete) {
            console.error("[DEBUG] confirmDelete: 'paymentToDelete' es nulo. Abortando.");
            return;
        }
        console.log(`[DEBUG] confirmDelete: Eliminando pago ID: ${paymentToDelete.id} para compra ID: ${purchase.id}`);
    
        setIsDeleting(true);
        console.log("[DEBUG] confirmDelete: Estado 'isDeleting' establecido en true. El spinner debería aparecer.");
    
        try {
            console.log("[DEBUG] confirmDelete: Invocando la función de Supabase 'eliminar-pago-compra'.");
            const { error, data } = await supabase.functions.invoke('eliminar-pago-compra', {
                body: {
                    paymentId: paymentToDelete.id,
                    purchaseId: purchase.id
                }
            });
            console.log("[DEBUG] confirmDelete: La llamada a la función de Supabase ha finalizado.");
    
            if (error) {
                const functionError = data?.msg || error.message;
                console.error("[DEBUG] confirmDelete: La función de Supabase devolvió un error.", { error, data });
                throw new Error(functionError);
            }
            
            console.log("[DEBUG] confirmDelete: La función de Supabase fue exitosa.", data);
            addToast(data?.message || 'Pago eliminado con éxito.', 'success');
            
            console.log("[DEBUG] confirmDelete: Cerrando modal de confirmación (setPaymentToDelete(null)).");
            setPaymentToDelete(null); 
            
            console.log("[DEBUG] confirmDelete: Refrescando la lista de pagos (fetchPayments).");
            await fetchPayments(); 
            
            console.log("[DEBUG] confirmDelete: Notificando al componente padre para que se actualice (onPaymentsUpdate).");
            onPaymentsUpdate(); 
        } catch (error: any) {
            console.error("[DEBUG] confirmDelete: Se ha capturado un error en el bloque try-catch.", error);
            addToast(`Error al eliminar: ${error.message}`, 'error');
        } finally {
            console.log("[DEBUG] confirmDelete: Estableciendo el estado 'isDeleting' en false.");
            setIsDeleting(false);
        }
    };

    return (
        <>
            <Modal 
                title={`Gestión de Pagos: ${purchase.folio}`}
                onClose={paymentToDelete ? () => {} : onClose}
                className="payments-modal"
            >
                <div className="modal-body">
                    <section className="payments-modal__summary">
                        <div className="payments-modal__summary-item">
                            <span className="label">Monto Total</span>
                            <span className="value total">{formatCurrency(purchase.monto_total)}</span>
                        </div>
                        <div className="payments-modal__summary-item">
                            <span className="label">Total Pagado</span>
                            <span className="value paid">{formatCurrency(totalPaid)}</span>
                        </div>
                        <div className="payments-modal__summary-item">
                            <span className="label">Saldo Pendiente</span>
                            <span className="value due">{formatCurrency(balanceDue)}</span>
                        </div>
                    </section>
                    <div className="payments-modal__progress-bar">
                        <div 
                            className={`payments-modal__progress-bar-filled ${progressBarColorClass}`}
                            style={{ width: `${progress > 100 ? 100 : progress}%` }}
                        >
                             {progress > 5 && (
                                <span className="payments-modal__progress-bar-text">{progress.toFixed(0)}%</span>
                            )}
                        </div>
                    </div>

                    <form onSubmit={handleAddPayment}>
                        <fieldset className="payments-modal__form">
                            <legend>Registrar Nuevo Pago</legend>
                            <div className="payments-modal__form-grid">
                                <div className="form-group">
                                    <label htmlFor="payment-amount">Monto a Pagar</label>
                                    <input id="payment-amount" type="number" step="0.01" value={amount} onChange={handleAmountChange} required disabled={isSaving} />
                                    {change > 0 && (
                                        <p className="payments-modal__change-indicator">
                                            <span className="material-icons">payment</span>
                                            Vuelto: {formatCurrency(change)}
                                        </p>
                                    )}
                                </div>
                                 <div className="form-group">
                                    <label htmlFor="payment-method">Método de Pago</label>
                                    <select id="payment-method" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} required disabled={isSaving}>
                                        {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="payment-date">Fecha de Pago</label>
                                    <input id="payment-date" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required disabled={isSaving} />
                                </div>
                                 <div className="form-group payments-modal__notes-group">
                                    <label htmlFor="payment-notes">Notas (Opcional)</label>
                                    <input id="payment-notes" type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: N° de referencia..." disabled={isSaving} />
                                </div>
                                 <button type="submit" className="btn btn--primary payments-modal__add-btn" disabled={isSaving}>
                                    <span className="material-icons">add</span>
                                    {isSaving ? 'Añadiendo...' : 'Añadir Pago'}
                                </button>
                            </div>
                        </fieldset>
                    </form>
                    
                    <section className="payments-modal__history">
                        <div className="payments-modal__history-header">
                            <h3>Historial de Pagos</h3>
                            <span className="payments-modal__history-count">{payments.length}</span>
                        </div>
                        <div className="payments-modal__table-container">
                            <table className="payments-modal__table">
                                <thead>
                                    <tr>
                                        <th>Fecha y Hora</th>
                                        <th>Monto</th>
                                        <th>Método</th>
                                        <th>Notas</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={5}>Cargando historial...</td></tr>
                                    ) : payments.length > 0 ? (
                                        payments.map(p => (
                                            <tr key={p.id}>
                                                <td>{new Date(p.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                                <td>{formatCurrency(p.monto)}</td>
                                                <td>{p.metodo_pago}</td>
                                                <td>{p.notas || <span className="no-notes">N/A</span>}</td>
                                                <td>
                                                    <button 
                                                        onClick={() => handleDeleteClick(p)} 
                                                        className="btn-icon" 
                                                        aria-label="Eliminar pago"
                                                    >
                                                        <span className="material-icons">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={5}>No se han registrado pagos para esta compra.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
                <div className="modal-footer">
                    <button type="button" onClick={onClose} className="btn btn--danger">Cerrar</button>
                </div>
            </Modal>

            {paymentToDelete && (
                <Modal
                    title="Confirmar Eliminación"
                    onClose={() => setPaymentToDelete(null)}
                >
                    <div className="modal-body">
                        <p>¿Está seguro de que desea eliminar el pago de <strong>{formatCurrency(paymentToDelete.monto)}</strong> del <strong>{new Date(paymentToDelete.created_at).toLocaleDateString('es-ES')}</strong>?</p>
                        <p>Esta acción no se puede deshacer.</p>
                        <p className="payments-modal__debug-info">ID del Pago: {paymentToDelete.id}</p>
                    </div>
                    <div className="modal-footer">
                        <button type="button" onClick={() => setPaymentToDelete(null)} className="btn btn--danger" disabled={isDeleting}>
                            Cancelar
                        </button>
                        <button type="button" onClick={confirmDelete} className="btn btn--danger" disabled={isDeleting}>
                            {isDeleting ? (
                                <>
                                    <span className="spinner-sm" role="status" aria-hidden="true"></span>
                                    <span>Eliminando...</span>
                                </>
                            ) : (
                                'Eliminar'
                            )}
                        </button>
                    </div>
                </Modal>
            )}
        </>
    );
};

export default PaymentsModal;