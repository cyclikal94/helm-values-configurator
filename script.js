// Global variables
let editor;
let yamlData = {};
let previousYamlData = {};
let schema = {};

// ------------------------------------------------------------
// Site initialization and setup
// ------------------------------------------------------------

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

// Load initial YAML content
async function loadInitialYaml() {
    try {
        const response = await fetch('values.yaml');
        const content = await response.text();
        yamlData = jsyaml.load(content);
        previousYamlData = JSON.parse(JSON.stringify(yamlData));
        editor.setValue(jsyaml.dump(yamlData));
        validateYaml(true);
    } catch (error) {
        showError('Error loading initial YAML: ' + error.message);
    }
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

// ------------------------------------------------------------
// Form generation and input handling
// ------------------------------------------------------------

// Format field name for display
function formatFieldName(name) {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

// Generate form from schema
function generateForm(schema, parentElement, path = '') {
    if (!schema || !schema.properties) return;

    Object.entries(schema.properties).forEach(([key, value]) => {
        // Skip 'enabled' property as it will be handled by the parent
        if (key === 'enabled') return;

        const currentPath = path ? `${path}.${key}` : key;
        const form_group = document.createElement('div');
        form_group.className = 'form-group';
        
        // Add collapsed class by default if it has properties
        if (value.type === 'object' && value.properties) {
            form_group.classList.add('collapsed');
        }
        
        const header = document.createElement('div');
        header.className = 'form-group-header';
        
        const section_title = document.createElement('div');
        section_title.className = 'section-title';
        
        const title_text = document.createElement('span');
        title_text.textContent = formatFieldName(key);
        section_title.appendChild(title_text);

        const title_controls = document.createElement('div');
        title_controls.className = 'section-title-controls';

        // Add enabled checkbox if present
        if (value.type === 'object' && value.properties && value.properties.enabled) {
            const enabledInput = createInputElement(value.properties.enabled, `${currentPath}.enabled`);
            if (enabledInput) {
                enabledInput.classList.add('checkbox-container');
                // Find the actual input element and add the tooltip to it
                const checkbox = enabledInput.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.classList.add('enabled-checkbox');
                    // Add tooltip for enabled checkbox description
                    if (value.properties.enabled.description) {
                        const tooltip = value.properties.enabled.description;
                        checkbox.setAttribute('data-tooltip', tooltip);
                        // Clear the title to prevent default browser tooltip
                        checkbox.title = '';
                    }
                }
                title_controls.appendChild(enabledInput);
            }
        }

        // Add toggle button if this is an object with properties
        if (value.type === 'object' && value.properties) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'form-group-toggle';
            toggleBtn.innerHTML = '▶'; // Start with collapsed arrow
            toggleBtn.addEventListener('click', () => {
                form_group.classList.toggle('collapsed');
                toggleBtn.innerHTML = form_group.classList.contains('collapsed') ? '▶' : '▼';
            });
            title_controls.appendChild(toggleBtn);
        }

        section_title.appendChild(title_controls);
        header.appendChild(section_title);
        form_group.appendChild(header);

        if (value.type === 'object' && value.properties) {
            // Add description for form groups if it exists
            if (value.description) {
                const description = document.createElement('div');
                description.className = 'field-description';
                description.textContent = value.description;
                form_group.appendChild(description);
            }
            
            const content = document.createElement('div');
            content.className = 'form-group-content';
            form_group.appendChild(content);
            // Recursively generate form for nested objects
            generateForm(value, content, currentPath);
        } else if (value.type === 'boolean') {
            const input = createInputElement(value, currentPath);
            if (input) {
                if (value.description) {
                    const description = document.createElement('div');
                    description.className = 'field-description';
                    description.textContent = value.description;
                    form_group.appendChild(description);
                }
                title_controls.appendChild(input);
            }
        } else {
            const input = createInputElement(value, currentPath);
            if (input) {
                if (value.description) {
                    const description = document.createElement('div');
                    description.className = 'field-description';
                    description.textContent = value.description;
                    form_group.appendChild(description);
                }
                form_group.appendChild(input);
            }
        }

        parentElement.appendChild(form_group);
    });
}

// Create appropriate input element based on schema type
function createInputElement(schema, path) {
    let input;
    let types = Array.isArray(schema.type) ? schema.type : [schema.type];
    let container = document.createElement('div');
    container.className = 'input-container';

    const allowsNull = types.includes('null');
    const nonNullTypes = types.filter(t => t !== 'null');
    const primaryType = nonNullTypes.length > 0 ? nonNullTypes[0] : 'string';
    const defaultValue = schema.default;

    switch (primaryType) {
        case 'string':
            if (schema.enum) {
                input = document.createElement('select');
                // Add an empty option if no default value
                if (defaultValue === undefined) {
                    const emptyOption = document.createElement('option');
                    emptyOption.value = '';
                    emptyOption.textContent = '-- Select --';
                    input.appendChild(emptyOption);
                }
                schema.enum.forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option;
                    optionElement.textContent = option;
                    input.appendChild(optionElement);
                });
            } else {
                input = document.createElement('input');
                input.type = 'text';
                if (defaultValue !== undefined) {
                    input.placeholder = defaultValue;
                }
            }
            break;

        case 'number':
        case 'integer':
            input = document.createElement('input');
            input.type = 'number';
            if (schema.minimum !== undefined) input.min = schema.minimum;
            if (schema.maximum !== undefined) input.max = schema.maximum;
            if (defaultValue !== undefined) {
                input.placeholder = defaultValue;
            }
            break;

        case 'boolean':
            input = document.createElement('input');
            input.type = 'checkbox';
            break;

        default:
            return null;
    }

    if (input) {
        input.id = path;
        input.className = 'form-input';
        if (allowsNull) {
            input.classList.add('null-allowed');
        }

        if (input.type !== 'checkbox') {
            container.appendChild(input);
        }

        // Add default indicator if there's a default value
        if (defaultValue !== undefined) {
            const defaultIndicator = document.createElement('span');
            defaultIndicator.className = 'default-indicator';
            defaultIndicator.textContent = 'default';
            container.appendChild(defaultIndicator);

            if (input.type === 'checkbox') {
                container.appendChild(input);
                // For checkboxes, update indicator based on checked state
                input.addEventListener('change', (e) => {
                    defaultIndicator.style.display = (e.target.checked === defaultValue) ? 'inline-flex' : 'none';
                });
                // Set initial visibility
                defaultIndicator.style.display = (input.checked === defaultValue) ? 'inline-flex' : 'none';
            } else {
                // For non-checkbox inputs, update the indicator visibility based on value
                input.addEventListener('input', (e) => {
                    const isEmpty = !e.target.value;
                    const isDefault = e.target.value === String(defaultValue);
                    defaultIndicator.style.display = (isEmpty || isDefault) ? 'inline-flex' : 'none';
                });
            }
        }

        input.addEventListener('change', (e) => handleInputChange(e, path));
    }

    return container;
}

// Handle form input changes
function handleInputChange(event, path) {
    // TODO: Implement
}

// ------------------------------------------------------------
// YAML validation and error handling
// ------------------------------------------------------------

// Show error message
function showError(message) {
    const errorElement = document.getElementById('yaml-error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'inline-flex';
}

// Populate form with YAML values
function populateFormFromYaml(data, parentPath = '') {
    // First, clear all form inputs that start with the parent path
    const inputs = document.querySelectorAll('.form-input');
    inputs.forEach(input => {
        if (!parentPath || input.id.startsWith(parentPath)) {
            if (input.type === 'checkbox') {
                input.checked = false;
                // Update default indicator if it exists
                const defaultIndicator = input.closest('.input-container')?.querySelector('.default-indicator');
                if (defaultIndicator) {
                    const defaultValue = getSchemaDefaultValue(input.id);
                    defaultIndicator.style.display = (input.checked === defaultValue) ? 'inline-flex' : 'none';
                }
            } else {
                input.value = '';
                // Update default indicator if it exists
                const defaultIndicator = input.closest('.input-container')?.querySelector('.default-indicator');
                if (defaultIndicator) {
                    defaultIndicator.style.display = 'inline-flex'; // Show when empty as placeholder is showing
                }
            }
        }
    });

    // Then populate with current values
    if (data) {
        Object.entries(data).forEach(([key, value]) => {
            const path = parentPath ? `${parentPath}.${key}` : key;
            const input = document.getElementById(path);
            
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = value;
                    // Update default indicator
                    const defaultIndicator = input.closest('.input-container')?.querySelector('.default-indicator');
                    if (defaultIndicator) {
                        const defaultValue = getSchemaDefaultValue(path);
                        defaultIndicator.style.display = (value === defaultValue) ? 'inline-flex' : 'none';
                    }
                } else {
                    input.value = value ?? '';
                    // Update default indicator
                    const defaultIndicator = input.closest('.input-container')?.querySelector('.default-indicator');
                    if (defaultIndicator) {
                        const defaultValue = getSchemaDefaultValue(path);
                        defaultIndicator.style.display = (String(value) === String(defaultValue)) ? 'inline-flex' : 'none';
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                populateFormFromYaml(value, path);
            }
        });
    }
}

// Helper function to get the default value from schema for a given path
function getSchemaDefaultValue(path) {
    const parts = path.split('.');
    let current = schema;
    
    for (const part of parts) {
        if (current?.properties?.[part]) {
            current = current.properties[part];
        } else {
            return undefined;
        }
    }
    
    return current.default;
}

// Compare two objects and return the paths of changed values
function findChangedPaths(oldObj, newObj, path = '') {
    const changes = [];
    
    // Helper to check if a value has changed
    const hasValueChanged = (oldVal, newVal) => {
        if (oldVal === newVal) return false;
        if (oldVal === null || newVal === null) return true;
        if (typeof oldVal !== typeof newVal) return true;
        if (typeof oldVal === 'object') return false; // We'll handle objects recursively
        return oldVal !== newVal;
    };

    // Get all keys from both objects
    const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

    for (const key of keys) {
        const currentPath = path ? `${path}.${key}` : key;
        const oldValue = oldObj?.[key];
        const newValue = newObj?.[key];

        if (oldValue === undefined || newValue === undefined) {
            changes.push(currentPath);
        } else if (typeof newValue === 'object' && newValue !== null && typeof oldValue === 'object' && oldValue !== null) {
            // Recursively check nested objects
            changes.push(...findChangedPaths(oldValue, newValue, currentPath));
        } else if (hasValueChanged(oldValue, newValue)) {
            changes.push(currentPath);
        }
    }

    return changes;
}

// Update specific form fields based on changed paths
function updateChangedFormFields(changedPaths, data) {
    // Get all form inputs that match any of the changed paths or their parent paths
    const inputs = document.querySelectorAll('.form-input');
    const affectedPaths = new Set();
    
    // Add all parent paths of changed paths
    changedPaths.forEach(path => {
        let currentPath = '';
        path.split('.').forEach(part => {
            currentPath = currentPath ? `${currentPath}.${part}` : part;
            affectedPaths.add(currentPath);
        });
    });

    // Update or clear all affected inputs
    inputs.forEach(input => {
        const path = input.id;
        if (affectedPaths.has(path.split('.')[0])) {
            const value = getValueByPath(data, path);
            if (value === undefined) {
                // Clear the input if the path no longer exists in the data
                if (input.type === 'checkbox') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            } else {
                // Update with new value
                if (input.type === 'checkbox') {
                    input.checked = value;
                } else {
                    input.value = value ?? '';
                }
            }
        }
    });
}

// Helper function to get a value from an object by dot-notation path
function getValueByPath(obj, path) {
    return path.split('.').reduce((acc, part) => {
        // Return undefined if any part of the path is missing
        return acc === undefined ? undefined : acc?.[part];
    }, obj);
}

// Validate YAML content
function validateYaml(fullUpdate = false) {
    const content = editor.getValue();
    const statusElement = document.querySelector('.yaml-status');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    const errorMessageElement = document.getElementById('yaml-error-message');

    try {
        const newYamlData = jsyaml.load(content);
        
        // Find changed paths between old and new YAML data
        const changedPaths = findChangedPaths(previousYamlData, newYamlData);
        
        // Update status to valid
        statusElement.classList.remove('invalid');
        statusElement.classList.add('valid');
        statusIcon.textContent = '✓';
        statusText.textContent = 'Valid YAML';
        errorMessageElement.style.display = 'none';
        
        if (fullUpdate) {
            populateFormFromYaml(newYamlData);
        } else {
            updateChangedFormFields(changedPaths, newYamlData);
        }
        
        // Update the stored YAML data (fix the order)
        yamlData = newYamlData;
        previousYamlData = JSON.parse(JSON.stringify(newYamlData)); // Deep copy new state
    } catch (error) {
        // Update status to invalid
        statusElement.classList.remove('valid');
        statusElement.classList.add('invalid');
        statusIcon.textContent = '✗';
        statusText.textContent = 'Invalid YAML';
        
        // Show error message
        errorMessageElement.style.display = 'inline-flex';
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