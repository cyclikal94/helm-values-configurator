// Global variables
let editor;
let yamlData = {};

// Initialize CodeMirror editor
function initializeEditor() {
    const textarea = document.getElementById('yaml-textarea');
    editor = CodeMirror.fromTextArea(textarea, {
        mode: 'yaml',
        theme: 'monokai',
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 2,
        tabSize: 2,
        autofocus: true,
        extraKeys: {
            'Tab': function(cm) {
                cm.replaceSelection('  ');
            }
        }
    });

    // Add change listener
    editor.on('change', debounce(validateYaml, 500));
}

// Load initial YAML content
async function loadInitialYaml() {
    try {
        const response = await fetch('values.yaml');
        const content = await response.text();
        yamlData = jsyaml.load(content);
        editor.setValue(content);
        validateYaml();
    } catch (error) {
        showError('Error loading initial YAML: ' + error.message);
    }
}

// Validate YAML content
function validateYaml() {
    const content = editor.getValue();
    const statusElement = document.querySelector('.yaml-status');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    const errorMessageElement = document.getElementById('yaml-error-message');

    try {
        yamlData = jsyaml.load(content);
        
        // Update status to valid
        statusElement.classList.remove('invalid');
        statusElement.classList.add('valid');
        statusIcon.textContent = '✓';
        statusText.textContent = 'Valid YAML';
        errorMessageElement.style.display = 'none';
    } catch (error) {
        // Update status to invalid
        statusElement.classList.remove('valid');
        statusElement.classList.add('invalid');
        statusIcon.textContent = '✗';
        statusText.textContent = 'Invalid YAML';
        
        // Show error message
        errorMessageElement.style.display = 'block';
        errorMessageElement.textContent = `Error: ${error.message}`;
    }
}

// Utility function to debounce function calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Handle file download
function setupDownloadButton() {
    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.addEventListener('click', () => {
        const content = editor.getValue();
        const blob = new Blob([content], { type: 'text/yaml' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'values.yaml';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    });
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeEditor();
    loadInitialYaml();
    setupDownloadButton();
});
