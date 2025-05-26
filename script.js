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
    editor.on('change', debounce(() => validateYaml(false), 500));
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
            toggleBtn.className = 'form-group-controls form-group-toggle';
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
                
                // If this is an array type, move its controls to the title_controls
                if (value.type === 'array' && input.arrayControls) {
                    const controls = input.arrayControls;
                    controls.className = 'section-title-controls';
                    title_controls.appendChild(controls);
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
        case 'array':
            container = document.createElement('div');
            container.className = 'form-group-content';
            container.id = path;  // Set ID on the array container
            
            // Create array controls - these will be moved to the form-group header by the generateForm function
            const arrayControls = document.createElement('div');
            arrayControls.className = 'array-controls';
            
            // Add item button
            const addButton = document.createElement('button');
            addButton.className = 'form-group-controls form-group-add';
            addButton.innerHTML = '<span class="rotate-45">✗</span>';
            addButton.title = 'Add item';
            addButton.addEventListener('click', () => {
                const itemCount = container.children.length;
                const newCard = createArrayItemCard(schema.items, path, itemCount);
                
                // Ensure section is expanded when adding items
                const parentGroup = container.closest('.form-group');
                if (parentGroup) {
                    parentGroup.classList.remove('collapsed');
                }
                
                container.appendChild(newCard);
                updateArrayItemTitles(container, path);
                
                // Show toggle button when items exist
                updateArrayToggleVisibility(container);
            });
            
            // Clear array button
            const clearButton = document.createElement('button');
            clearButton.className = 'form-group-controls form-group-remove';
            clearButton.innerHTML = '✗';
            clearButton.title = 'Clear all items';
            clearButton.addEventListener('click', () => {
                container.innerHTML = '';
                handleInputChange({ target: container }, path);
                // Hide toggle button when no items
                updateArrayToggleVisibility(container);
            });

            // Toggle button for array section
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'form-group-controls form-group-toggle';
            toggleBtn.innerHTML = '▶'; // Start with collapsed arrow
            toggleBtn.style.display = 'none'; // Hide initially
            toggleBtn.addEventListener('click', () => {
                const parentGroup = container.closest('.form-group');
                if (parentGroup) {
                    parentGroup.classList.toggle('collapsed');
                    toggleBtn.innerHTML = parentGroup.classList.contains('collapsed') ? '▶' : '▼';
                }
            });
            
            arrayControls.appendChild(addButton);
            arrayControls.appendChild(clearButton);
            arrayControls.appendChild(toggleBtn); // Add toggle as last control
            container.arrayControls = arrayControls; // Attach controls to container for later use
            
            // If there's a default value, populate it
            if (defaultValue && Array.isArray(defaultValue)) {
                defaultValue.forEach((item, index) => {
                    const itemCard = createArrayItemCard(schema.items, path, index);
                    container.appendChild(itemCard);
                });
                updateArrayItemTitles(container, path);
                // Show toggle if we added items
                updateArrayToggleVisibility(container);
            }
            
            return container;

        case 'string':
            if (schema.enum) {
                input = document.createElement('select');
                // Set initial hidden value if no default
                if (defaultValue === undefined) {
                    input.value = '';
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

// Helper function to create an array item card
function createArrayItemCard(itemSchema, arrayPath, index) {
    const card = document.createElement('div');
    card.className = 'form-group';
    
    // Create card header
    const header = document.createElement('div');
    header.className = 'form-group-header';
    
    const section_title = document.createElement('div');
    section_title.className = 'section-title';
    
    // Create title
    const title_text = document.createElement('span');
    title_text.className = 'array-item-title'; // Keep this class for updating titles
    section_title.appendChild(title_text);
    
    // Create controls
    const title_controls = document.createElement('div');
    title_controls.className = 'section-title-controls';
    
    // Move up button
    const moveUpBtn = document.createElement('button');
    moveUpBtn.className = 'form-group-controls form-group-info';
    moveUpBtn.innerHTML = '↑';
    moveUpBtn.title = 'Move up';
    moveUpBtn.addEventListener('click', () => {
        const prev = card.previousElementSibling;
        if (prev) {
            card.parentNode.insertBefore(card, prev);
            updateArrayItemTitles(card.parentNode, arrayPath);
            handleInputChange({ target: card.parentNode }, arrayPath);
        }
    });
    
    // Move down button
    const moveDownBtn = document.createElement('button');
    moveDownBtn.className = 'form-group-controls form-group-info';
    moveDownBtn.innerHTML = '↓';
    moveDownBtn.title = 'Move down';
    moveDownBtn.addEventListener('click', () => {
        const next = card.nextElementSibling;
        if (next) {
            card.parentNode.insertBefore(next, card);
            updateArrayItemTitles(card.parentNode, arrayPath);
            handleInputChange({ target: card.parentNode }, arrayPath);
        }
    });
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'form-group-controls form-group-remove';
    removeBtn.innerHTML = '✗';
    removeBtn.title = 'Remove item';
    removeBtn.addEventListener('click', () => {
        const arrayContent = card.parentNode;
        if (arrayContent) {
            card.remove();
            updateArrayItemTitles(arrayContent, arrayPath);
            handleInputChange({ target: arrayContent }, arrayPath);
        }
    });
    
    title_controls.appendChild(moveUpBtn);
    title_controls.appendChild(moveDownBtn);
    title_controls.appendChild(removeBtn);
    section_title.appendChild(title_controls);
    header.appendChild(section_title);
    card.appendChild(header);
    
    // Create content
    const content = document.createElement('div');
    content.className = 'form-group-content';
    
    // Generate form elements for the item's properties
    if (itemSchema.type === 'object' && itemSchema.properties) {
        Object.entries(itemSchema.properties).forEach(([key, propSchema]) => {
            const itemPath = `${arrayPath}.${index}.${key}`;
            
            const form_group = document.createElement('div');
            form_group.className = 'form-group';
            
            const label = document.createElement('div');
            label.className = 'section-title';
            label.textContent = formatFieldName(key);
            if (propSchema.description) {
                label.title = propSchema.description;
            }
            form_group.appendChild(label);
            
            const input = createInputElement(propSchema, itemPath);
            if (input) {
                if (propSchema.description) {
                    const description = document.createElement('div');
                    description.className = 'field-description';
                    description.textContent = propSchema.description;
                    form_group.appendChild(description);
                }
                form_group.appendChild(input);
                
                // If this is a name property, update the card title when it changes
                if (key === 'name') {
                    const nameInput = input.querySelector('input');
                    if (nameInput) {
                        nameInput.addEventListener('input', (e) => {
                            const value = e.target.value.trim();
                            const defaultTitle = getDefaultArrayItemTitle(arrayPath, index);
                            title_text.textContent = value || defaultTitle;
                        });
                    }
                }
            }
            content.appendChild(form_group);
        });
    }
    
    card.appendChild(content);
    
    // Set initial title
    title_text.textContent = getDefaultArrayItemTitle(arrayPath, index);
    
    return card;
}

// Helper function to update array item titles
function updateArrayItemTitles(arrayContainer, arrayPath) {
    if (!arrayContainer) return;
    
    const cards = arrayContainer.children;
    Array.from(cards).forEach((card, index) => {
        // Update all input IDs in the card to match the new index
        const inputs = card.querySelectorAll('input, select');
        inputs.forEach(input => {
            const oldId = input.id;
            const parts = oldId.split('.');
            // Only update if this input belongs to this array
            if (parts[0] === arrayPath.split('.')[0]) {
                const lastPart = parts[parts.length - 1];
                const newId = `${arrayPath}.${index}.${lastPart}`;
                input.id = newId;
            }
        });

        // Update the title
        const title = card.querySelector('.array-item-title');
        const nameInput = card.querySelector(`[id$=".${index}.name"]`);
        const nameValue = nameInput ? nameInput.value.trim() : '';
        if (title) {
            title.textContent = nameValue || getDefaultArrayItemTitle(arrayPath, index);
        }
    });
}

// Helper function to get default array item title
function getDefaultArrayItemTitle(arrayPath, index) {
    const baseName = formatFieldName(arrayPath.split('.').pop().replace(/\[\d+\]$/, ''));
    // Remove trailing 's' if it exists and add item number
    return `${baseName.replace(/s$/, '')} ${index + 1}`;
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
        // Handle undefined/null cases
        if (oldVal === undefined || newVal === undefined) return true;
        if (oldVal === null || newVal === null) return oldVal !== newVal;
        
        // Handle different types
        if (typeof oldVal !== typeof newVal) return true;
        
        // Handle arrays
        if (Array.isArray(oldVal) && Array.isArray(newVal)) {
            if (oldVal.length !== newVal.length) return true;
            return oldVal.some((val, idx) => hasValueChanged(val, newVal[idx]));
        }
        
        // Handle objects (but not arrays)
        if (typeof oldVal === 'object' && !Array.isArray(oldVal) &&
            typeof newVal === 'object' && !Array.isArray(newVal)) {
            return false; // We'll handle objects recursively in the main function
        }
        
        // Handle primitives
        return oldVal !== newVal;
    };

    // Get all keys from both objects
    const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

    for (const key of keys) {
        const currentPath = path ? `${path}.${key}` : key;
        const oldValue = oldObj?.[key];
        const newValue = newObj?.[key];

        // Handle undefined/deleted properties
        if (oldValue === undefined || newValue === undefined) {
            changes.push(currentPath);
            continue;
        }

        // Handle arrays specially
        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
            // Always add the array path itself if there's any change
            if (oldValue.length !== newValue.length) {
                changes.push(currentPath);
            }

            // Check each array item
            const maxLength = Math.max(oldValue.length, newValue.length);
            for (let i = 0; i < maxLength; i++) {
                const oldItem = oldValue[i];
                const newItem = newValue[i];

                // If item exists in both arrays and is an object, check it recursively
                if (oldItem && newItem && typeof oldItem === 'object' && typeof newItem === 'object') {
                    const itemChanges = findChangedPaths(oldItem, newItem, `${currentPath}.${i}`);
                    if (itemChanges.length > 0) {
                        changes.push(`${currentPath}.${i}`);
                        changes.push(...itemChanges);
                    }
                }
                // If items are different (including one being undefined), mark as changed
                else if (hasValueChanged(oldItem, newItem)) {
                    changes.push(`${currentPath}.${i}`);
                }
            }
        }
        // Handle nested objects (but not arrays)
        else if (typeof newValue === 'object' && newValue !== null && 
                 typeof oldValue === 'object' && oldValue !== null &&
                 !Array.isArray(newValue) && !Array.isArray(oldValue)) {
            changes.push(...findChangedPaths(oldValue, newValue, currentPath));
        }
        // Handle primitives and other values
        else if (hasValueChanged(oldValue, newValue)) {
            changes.push(currentPath);
        }
    }

    // Remove duplicates and return
    return [...new Set(changes)];
}

// Helper function to check if a path is an array item and extract array info
function getArrayInfo(path) {
    const match = path.match(/^(.*?)\.(\d+)\.(.*)$/);
    if (match) {
        return {
            isArrayItem: true,
            arrayPath: match[1], // Path to the array
            index: parseInt(match[2]), // Array index
            remainingPath: match[3] // Remaining path after array item
        };
    }
    return { isArrayItem: false };
}

// Update specific form fields based on changed paths
function updateChangedFormFields(changedPaths, data) {
    console.log('Changed paths:', changedPaths);
    console.log('Current data:', data);

    const inputs = document.querySelectorAll('.form-input');
    const affectedPaths = new Set(changedPaths);
    const processedArrays = new Set();

    // First, find all array paths that need updating
    const arrayPathsToUpdate = new Set();
    changedPaths.forEach(path => {
        // If the path itself is an array
        const value = getValueByPath(data, path);
        if (Array.isArray(value)) {
            arrayPathsToUpdate.add(path);
        }
        
        // If this is an array item, add its parent array path
        const arrayInfo = getArrayInfo(path);
        if (arrayInfo.isArrayItem) {
            arrayPathsToUpdate.add(arrayInfo.arrayPath);
        }
    });

    console.log('Array paths to update:', [...arrayPathsToUpdate]);

    // Update all affected arrays
    arrayPathsToUpdate.forEach(arrayPath => {
        const arrayValue = getValueByPath(data, arrayPath);
        if (Array.isArray(arrayValue)) {
            const arrayContainer = document.getElementById(arrayPath);
            console.log('Found array container for path:', arrayPath, arrayContainer);
            if (arrayContainer) {
                updateArrayContainer(arrayContainer, arrayPath, arrayValue, data);
            } else {
                console.warn('Could not find array container for path:', arrayPath);
            }
        }
    });

    // Then update individual form fields
    inputs.forEach(input => {
        const path = input.id;
        const arrayInfo = getArrayInfo(path);

        if (affectedPaths.has(path) || 
            (arrayInfo.isArrayItem && affectedPaths.has(`${arrayInfo.arrayPath}.${arrayInfo.index}.${arrayInfo.remainingPath}`))) {
            
            const value = getValueByPath(data, path);
            
            if (value === undefined) {
                if (input.type === 'checkbox') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            } else {
                if (input.type === 'checkbox') {
                    input.checked = value;
                } else {
                    input.value = value ?? '';
                }
            }
            
            // Update default indicator if it exists
            const defaultIndicator = input.closest('.input-container')?.querySelector('.default-indicator');
            if (defaultIndicator) {
                const defaultValue = getSchemaDefaultValue(path);
                if (input.type === 'checkbox') {
                    defaultIndicator.style.display = (input.checked === defaultValue) ? 'inline-flex' : 'none';
                } else {
                    defaultIndicator.style.display = (String(input.value) === String(defaultValue)) ? 'inline-flex' : 'none';
                }
            }
        }
    });
}

function updateArrayContainer(container, arrayPath, arrayValue, fullData) {
    console.log('Updating array container:', {
        arrayPath,
        currentCards: container.children.length,
        newArrayLength: Array.isArray(arrayValue) ? arrayValue.length : 0,
        arrayValue
    });

    const itemSchema = getArrayItemSchema(arrayPath);
    if (!itemSchema) {
        console.warn('No item schema found for array path:', arrayPath);
        return;
    }

    // Treat empty objects or non-array values as empty arrays
    if (!Array.isArray(arrayValue) || Object.keys(arrayValue).length === 0) {
        console.log('Treating value as empty array:', arrayValue);
        arrayValue = [];
    }

    // Remove extra cards if array is now smaller
    while (container.children.length > arrayValue.length) {
        console.log('Removing extra card from', arrayPath);
        container.lastChild.remove();
    }

    // Add new cards if array is now larger
    while (container.children.length < arrayValue.length) {
        const index = container.children.length;
        console.log('Adding new card at index:', index, 'for path:', arrayPath);
        const newCard = createArrayItemCard(itemSchema, arrayPath, index);
        container.appendChild(newCard);
    }

    // Update all cards with current values
    Array.from(container.children).forEach((card, index) => {
        const itemValue = arrayValue[index];
        if (itemValue && typeof itemValue === 'object') {
            // Update all inputs in the card
            Object.entries(itemValue).forEach(([key, value]) => {
                const inputId = `${arrayPath}.${index}.${key}`;
                const input = card.querySelector(`[id="${inputId}"]`);
                if (input) {
                    // Update input ID to match new index
                    input.id = inputId;
                    if (input.type === 'checkbox') {
                        input.checked = value;
                    } else {
                        input.value = value ?? '';
                    }
                }
            });

            // Update the card title based on the name field if it exists
            const titleElement = card.querySelector('.array-item-title');
            if (titleElement) {
                const nameValue = itemValue.name;
                titleElement.textContent = nameValue || getDefaultArrayItemTitle(arrayPath, index);
            }
        }
    });

    // Update all array item titles and ensure IDs are correct
    updateArrayItemTitles(container, arrayPath);

    // Update toggle visibility based on array items
    updateArrayToggleVisibility(container);
}

// Helper function to get array item schema from the global schema
function getArrayItemSchema(arrayPath) {
    let current = schema;
    const parts = arrayPath.split('.');
    
    for (const part of parts) {
        if (!current?.properties?.[part]) return null;
        current = current.properties[part];
    }
    
    return current?.items;
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

// Helper function to update array toggle visibility
function updateArrayToggleVisibility(container) {
    const arrayControls = container.arrayControls;
    if (!arrayControls) return;

    const toggleBtn = arrayControls.querySelector('.form-group-toggle');
    if (!toggleBtn) return;

    const hasItems = container.children.length > 0;
    toggleBtn.style.display = hasItems ? 'inline-flex' : 'none';

    // Update toggle button icon to match current state
    const parentGroup = container.closest('.form-group');
    if (parentGroup && toggleBtn) {
        toggleBtn.innerHTML = parentGroup.classList.contains('collapsed') ? '▶' : '▼';
    }
}