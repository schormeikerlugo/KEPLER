/**
 * Chat Parser Module
 * Handles message parsing, markdown rendering, and format helpers
 */

// Format timestamp for display
export const formatTime = (date) => {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

// Parse message and render images inline + markdown
export const parseMessageWithImages = (text) => {
    if (!text) return '';

    // ===== MARKDOWN PARSING =====
    let parsed = text;

    // NOTE: We don't escape < and > because text comes from trusted backend

    // First, normalize multiple consecutive newlines to reduce excessive spacing
    parsed = parsed.replace(/\n{3,}/g, '\n\n');

    // Headings (# ## ###) - match anywhere, not just line start (models often indent)
    parsed = parsed.replace(/(?:^|\n)\s*### (.+)/g, '\n<h3>$1</h3>');
    parsed = parsed.replace(/(?:^|\n)\s*## (.+)/g, '\n<h2>$1</h2>');
    parsed = parsed.replace(/(?:^|\n)\s*# (.+)/g, '\n<h1>$1</h1>');

    // Bold and Italic (only use ** and * patterns, skip _ to avoid breaking words like show_image)
    parsed = parsed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Code inline
    parsed = parsed.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Tables - detect markdown table format
    parsed = parsed.replace(/\n?(^\|.+\|$)\n(^\|[-:| ]+\|$)\n((?:^\|.+\|$\n?)+)/gm, (match, header, separator, rows) => {
        const headers = header.split('|').filter(h => h.trim());
        const rowLines = rows.trim().split('\n');

        let table = '<table><thead><tr>';
        headers.forEach(h => table += `<th>${h.trim()}</th>`);
        table += '</tr></thead><tbody>';

        rowLines.forEach(row => {
            const cells = row.split('|').filter(c => c.trim());
            table += '<tr>';
            cells.forEach(c => table += `<td>${c.trim()}</td>`);
            table += '</tr>';
        });

        table += '</tbody></table>';
        return table;
    });

    // Horizontal rule
    parsed = parsed.replace(/^---$/gm, '<hr>');

    // ===== IMAGE PARSING =====

    // Pattern: [IMG:name](base64data)
    parsed = parsed.replace(/\[IMG:([^\]]*)\]\(([^)]+)\)/g, (match, name, data) => {
        return `<div class="chat-inline-image">
            <img src="${data}" alt="${name}" class="chat-img-clickable" data-fullsrc="${data}" data-name="${name}" />
            <span class="chat-image-caption">${name}</span>
        </div>`;
    });

    // Pattern: ![name](data:image/...) markdown style
    parsed = parsed.replace(/!\[([^\]]*)\]\((data:image[^)]+)\)/g, (match, name, data) => {
        return `<div class="chat-inline-image">
            <img src="${data}" alt="${name}" class="chat-img-clickable" data-fullsrc="${data}" data-name="${name}" />
            <span class="chat-image-caption">${name}</span>
        </div>`;
    });

    // Pattern: [ACTION:type:param] - Quick action buttons
    parsed = parsed.replace(/\[ACTION:([^:]+):([^\]]+)\]/g, (match, actionType, param) => {
        const actionLabels = {
            'show_objects': '📦 Ver objetos',
            'show_image': '🖼️ Ver imagen',
            'change_status': '📊 Cambiar estado',
            'export_csv': '📥 Exportar',
            'edit': '✏️ Editar',
            'delete': '🗑️ Eliminar',
            'confirm_delete': '🗑️ Sí, eliminar',
            'cancel_delete': '↩️ Cancelar'
        };
        const isDestructive = actionType.includes('confirm_delete');
        const isCancel = actionType.includes('cancel_delete');
        const label = actionLabels[actionType] || actionType;
        const extraClass = isDestructive ? ' chat-action-btn-danger' : (isCancel ? ' chat-action-btn-secondary' : '');
        return `<button class="chat-action-btn${extraClass}" data-action="${actionType}" data-param="${param}">${label}</button>`;
    });

    // Convert newlines to <br> but not around block elements
    // First, do the basic conversion
    parsed = parsed.replace(/\n/g, '<br>');
    // Then remove br immediately after block tags
    parsed = parsed.replace(/(<\/(?:table|h1|h2|h3|ul|ol|li|p|div|hr|thead|tbody|tr)>)<br>/gi, '$1');
    // Remove br immediately before block tags  
    parsed = parsed.replace(/<br>(<(?:table|h1|h2|h3|ul|ol|li|p|div|hr|thead|tbody|tr)[^>]*>)/gi, '$1');
    // Convert multiple consecutive br to single
    parsed = parsed.replace(/(<br>){2,}/gi, '<br>');
    // Remove leading/trailing br
    parsed = parsed.replace(/^(<br>)+|(<br>)+$/gi, '');

    return parsed;
};
