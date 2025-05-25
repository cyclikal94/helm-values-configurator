// Global variables
let editor;
let yamlData = {};
let schema = {};

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

// Load JSON Schema
async function loadSchema() {
    try {
        const response = await fetch('values.schema.json');
        schema = await response.json();
        generateForm(schema, document.querySelector('.config-section'));
    } catch (error) {
        showError('Error loading schema: ' + error.message);
    }
}

// Generate form from schema
function generateForm(schema, parentElement, path = '') {
    if (!schema || !schema.properties) return;

    Object.entries(schema.properties).forEach(([key, value]) => {
        const currentPath = path ? `${path}.${key}` : key;
        const form_group = document.createElement('div');
        form_group.className = 'form-group';
        
        const section_title = document.createElement('div');
        section_title.className = 'section-title';
        section_title.textContent = formatFieldName(key);
        form_group.appendChild(section_title);

        if (value.type === 'object' && value.properties) {
            // Recursively generate form for nested objects
            generateForm(value, form_group, currentPath);
        } else {
            const input = createInputElement(value, currentPath);
            if (input) {
                form_group.appendChild(input);
                if (value.description) {
                    const description = document.createElement('div');
                    description.className = 'field-description';
                    description.textContent = value.description;
                    form_group.appendChild(description);
                }
            }
        }

        parentElement.appendChild(form_group);
    });
}

// Create appropriate input element based on schema type
function createInputElement(schema, path) {
    let input;

    switch (schema.type) {
        case 'string':
            if (schema.enum) {
                input = document.createElement('select');
                schema.enum.forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option;
                    optionElement.textContent = option;
                    input.appendChild(optionElement);
                });
            } else {
                input = document.createElement('input');
                input.type = 'text';
            }
            break;

        case 'number':
        case 'integer':
            input = document.createElement('input');
            input.type = 'number';
            if (schema.minimum !== undefined) input.min = schema.minimum;
            if (schema.maximum !== undefined) input.max = schema.maximum;
            break;

        case 'boolean':
            input = document.createElement('input');
            input.type = 'checkbox';
            break;

        case 'array':
            // For simple arrays, create an add/remove interface
            input = document.createElement('div');
            input.className = 'array-container';
            const addButton = document.createElement('button');
            addButton.textContent = 'Add Item';
            addButton.onclick = () => addArrayItem(input, schema.items, path);
            input.appendChild(addButton);
            break;

        default:
            return null;
    }

    if (input) {
        input.id = path;
        input.className = 'form-input';
        input.addEventListener('change', (e) => handleInputChange(e, path));
    }

    return input;
}

// Add new item to array
function addArrayItem(container, itemSchema, path) {
    const itemContainer = document.createElement('div');
    itemContainer.className = 'array-item';
    
    const input = createInputElement(itemSchema, `${path}[]`);
    if (input) {
        itemContainer.appendChild(input);
        
        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.onclick = () => {
            container.removeChild(itemContainer);
            updateYamlFromForm();
        };
        
        itemContainer.appendChild(removeButton);
        container.insertBefore(itemContainer, container.lastChild);
    }
}

// Handle form input changes
function handleInputChange(event, path) {
    updateYamlFromForm();
}

// Update YAML content from form values
function updateYamlFromForm() {
    const formData = {};
    document.querySelectorAll('.form-input').forEach(input => {
        const path = input.id;
        let value;
        
        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.type === 'number') {
            value = Number(input.value);
        } else {
            value = input.value;
        }

        setNestedValue(formData, path, value);
    });

    yamlData = formData;
    const yamlString = jsyaml.dump(formData, { indent: 2 });
    editor.setValue(yamlString);
}

// Set nested object value from path
function setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
            current[part] = {};
        }
        current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
}

// Format field name for display
function formatFieldName(name) {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('yaml-error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

// Load initial YAML content
async function loadInitialYaml() {
    try {
        const response = await fetch('values.yaml');
        const content = await response.text();
        yamlData = jsyaml.load(content);
        editor.setValue(content);
        validateYaml();
        populateFormFromYaml(yamlData);
    } catch (error) {
        showError('Error loading initial YAML: ' + error.message);
    }
}

// Populate form with YAML values
function populateFormFromYaml(data, parentPath = '') {
    Object.entries(data).forEach(([key, value]) => {
        const path = parentPath ? `${parentPath}.${key}` : key;
        const input = document.getElementById(path);
        
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = value;
            } else {
                input.value = value;
            }
        } else if (typeof value === 'object' && value !== null) {
            populateFormFromYaml(value, path);
        }
    });
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
        
        // Update form with new values
        populateFormFromYaml(yamlData);
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
    loadSchema();
    loadInitialYaml();
    setupDownloadButton();
});
