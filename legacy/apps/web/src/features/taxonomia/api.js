/**
 * Taxonomia API Service - Mars-Sight AR
 * Funciones separadas para llamadas a la API de taxonomía
 */

const API_BASE = '/api/taxonomia';

export const taxonomiaApi = {
    // ============================================
    // Categorías
    // ============================================
    
    async getCategories() {
        const res = await fetch(`${API_BASE}/categorias`);
        return res.json();
    },
    
    async getCategory(id) {
        const res = await fetch(`${API_BASE}/categorias/${id}`);
        return res.json();
    },
    
    async createCategory(data) {
        const res = await fetch(`${API_BASE}/categorias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    
    async updateCategory(id, data) {
        const res = await fetch(`${API_BASE}/categorias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    
    async deleteCategory(id) {
        const res = await fetch(`${API_BASE}/categorias/${id}`, {
            method: 'DELETE'
        });
        return res.json();
    },
    
    // ============================================
    // Subcategorías
    // ============================================
    
    async getSubcategories(categoryId) {
        const res = await fetch(`${API_BASE}/subcategorias/${categoryId}`);
        return res.json();
    },
    
    async createSubcategory(data) {
        const res = await fetch(`${API_BASE}/subcategorias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    
    async deleteSubcategory(id) {
        const res = await fetch(`${API_BASE}/subcategorias/${id}`, {
            method: 'DELETE'
        });
        return res.json();
    },
    
    // ============================================
    // Etiquetas
    // ============================================
    
    async getTags() {
        const res = await fetch(`${API_BASE}/etiquetas`);
        return res.json();
    },
    
    async createTag(data) {
        const res = await fetch(`${API_BASE}/etiquetas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    
    async deleteTag(id) {
        const res = await fetch(`${API_BASE}/etiquetas/${id}`, {
            method: 'DELETE'
        });
        return res.json();
    },
    
    // ============================================
    // Asignación a Objetos
    // ============================================
    
    async assignTaxonomy(objectId, data) {
        const res = await fetch(`${API_BASE}/objetos/${objectId}/asignar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    
    async getObjectTaxonomy(objectId) {
        const res = await fetch(`${API_BASE}/objetos/${objectId}/taxonomia`);
        return res.json();
    }
};

export default taxonomiaApi;
