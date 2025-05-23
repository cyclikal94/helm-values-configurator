let schema = null;
let editor = null;
let isUpdatingYaml = false;
let isUpdatingForm = false;
let isUpdatingArrays = false;
let defaultValues = null;

// Load default values from values.yaml
fetch('values.yaml')
    .then(response => response.text())
    .then(yaml => {
        defaultValues = jsyaml.load(yaml);
    })
    .catch(error => console.error('Error loading default values:', error));

// Initialize CodeMirror editor
function initializeEditor() {
    editor = CodeMirror(document.getElementById('yaml-editor'), {
        mode: 'yaml',
        theme: 'eclipse',
        lineNumbers: true,
        lineWrapping: true,
        tabSize: 2,
        extraKeys: { 'Tab': 'indentMore', 'Shift-Tab': 'indentLess' },
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-lint-markers'],
        lint: true,
        value: ''
    });

    editor.on('change', debounce(handleYamlChange, 300));
    
    // Add styles if they don't exist
    if (!document.getElementById('yaml-error-styles')) {
        const styles = document.createElement('style');
        styles.id = 'yaml-error-styles';
        styles.textContent = `
            .yaml-error {
                background-color: rgba(255, 0, 0, 0.1);
                border-bottom: 2px wavy #dc3545;
            }
            .yaml-error-message {
                color: #dc3545;
                padding: 8px;
                margin: 8px 0;
                background-color: rgba(220, 53, 69, 0.1);
                border-radius: 4px;
                font-family: monospace;
            }
            .CodeMirror-lint-marker-error {
                width: 16px;
                height: 16px;
                background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23dc3545'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'/%3E%3C/svg%3E") center center no-repeat;
                background-size: contain;
                margin-left: 5px;
            }
            .CodeMirror-lint-message-error {
                padding-left: 20px;
                background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23dc3545'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'/%3E%3C/svg%3E") left top no-repeat;
                background-size: 16px;
            }
        `;
        document.head.appendChild(styles);
    }
}

// Debounce function to limit update frequency
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

// Handle YAML editor changes
function handleYamlChange() {
    // Reset update flags to prevent stuck states
    isUpdatingYaml = false;
    isUpdatingArrays = false;
    
    const yamlContent = editor.getValue();
    const yamlStatus = document.querySelector('.yaml-status');
    const errorMessage = document.querySelector('.yaml-error-message');
    const configSection = document.querySelector('.config-section');
    
    // Clear any existing error markers
    editor.operation(() => {
        const marks = editor.getAllMarks();
        marks.forEach(mark => mark.clear());
    });
    
    try {
        const values = jsyaml.load(yamlContent);
        yamlStatus.className = 'yaml-status valid';
        yamlStatus.innerHTML = '<span class="status-icon">✓</span><span class="status-text">Valid YAML</span>';
        errorMessage.style.display = 'none';
        configSection.classList.remove('disabled');
        
        if (yamlContent.trim()) {
            isUpdatingForm = true;
            try {
                updateFormFromYaml(values);
            } catch (formError) {
                console.error('Error updating form:', formError);
                yamlStatus.className = 'yaml-status invalid';
                yamlStatus.innerHTML = '<span class="status-icon">✕</span><span class="status-text">Error updating form</span>';
                errorMessage.textContent = 'Failed to update form with YAML values: ' + formError.message;
                errorMessage.style.display = 'block';
            }
            isUpdatingForm = false;
        }
    } catch (error) {
        yamlStatus.className = 'yaml-status invalid';
        yamlStatus.innerHTML = '<span class="status-icon">✕</span><span class="status-text">Invalid YAML</span>';
        
        // Parse the error message to get line and column information
        const positionMatch = error.message.match(/\((\d+):(\d+)\)/);
        let errorLine = 0;
        let errorColumn = 0;
        
        if (positionMatch) {
            errorLine = parseInt(positionMatch[1]) - 1;
            errorColumn = parseInt(positionMatch[2]);
        } else {
            const oldLineMatch = error.message.match(/line (\d+)/);
            errorLine = oldLineMatch ? parseInt(oldLineMatch[1]) - 1 : 0;
        }
        
        // Extract just the error message without position and context
        let errorType = error.message.split(/\s*\(\d+:\d+\)/)[0].trim();
        if (!errorType) {
            errorType = error.message.split('\n')[0].trim();
        }
        errorType = errorType.charAt(0).toUpperCase() + errorType.slice(1);
        
        // Mark the error in the editor
        const errorMark = editor.markText(
            {line: errorLine, ch: 0},
            {line: errorLine, ch: editor.getLine(errorLine)?.length || 0},
            {
                className: 'yaml-error',
                title: error.message
            }
        );
        
        // Show error message with line and column information
        errorMessage.textContent = `Error on Line ${errorLine + 1}${errorColumn ? ` Character ${errorColumn}` : ''}: ${errorType}`;
        errorMessage.style.display = 'block';
        
        // Scroll to the error
        editor.scrollIntoView({line: errorLine, ch: 0}, 100);
        
        configSection.classList.add('disabled');
    }
}

// Update form values from YAML
function updateFormFromYaml(values, parentPath = '') {
    if (!values || isUpdatingArrays) return;

    Object.entries(values).forEach(([key, value]) => {
        const path = parentPath ? `${parentPath}.${key}` : key;
        
        if (Array.isArray(value)) {
            const container = document.getElementById(`${path}-container`);
            if (container) {
                // Get current array values and compare only non-empty items
                const currentArrayValues = getArrayValues(container, path);
                if (JSON.stringify(currentArrayValues) !== JSON.stringify(value)) {
                    isUpdatingArrays = true;
                    
                    // Count existing empty items
                    const existingEmptyItems = Array.from(container.children).filter(item => {
                        const inputs = item.querySelectorAll('input, select');
                        return Array.from(inputs).every(input => !input.value);
                    });
                    
                    container.innerHTML = '';
                    
                    // First, add items from YAML
                    value.forEach((item, index) => {
                        const arrayPath = `${path}`;
                        const itemSchema = findSchemaForPath(arrayPath);
                        if (itemSchema && itemSchema.type === 'array' && itemSchema.items) {
                            addArrayItem(arrayPath, itemSchema.items, container, singularize(formatLabel(key)));
                            if (typeof item === 'object') {
                                Object.entries(item).forEach(([itemKey, itemValue]) => {
                                    const input = container.lastElementChild.querySelector(`input[data-path="${arrayPath}[].${itemKey}"], select[data-path="${arrayPath}[].${itemKey}"]`);
                                    if (input) {
                                        if (input.type === 'checkbox') {
                                            input.checked = itemValue;
                                        } else {
                                            input.value = itemValue;
                                        }
                                    }
                                });
                            } else {
                                const input = container.lastElementChild.querySelector(`input[data-path="${arrayPath}[]"], select[data-path="${arrayPath}[]"]`);
                                if (input) {
                                    if (input.type === 'checkbox') {
                                        input.checked = item;
                                    } else {
                                        input.value = item;
                                    }
                                }
                            }
                        }
                    });
                    
                    // Then add empty items back
                    const itemSchema = findSchemaForPath(path);
                    if (itemSchema && itemSchema.type === 'array' && itemSchema.items) {
                        existingEmptyItems.forEach(() => {
                            addArrayItem(path, itemSchema.items, container, singularize(formatLabel(key)));
                        });
                    }
                    
                    isUpdatingArrays = false;
                }
            }
        } else if (typeof value === 'object' && value !== null) {
            const container = document.getElementById(`${path}-container`);
            const itemSchema = findSchemaForPath(path);
            
            // Handle free-form objects (key/value pairs)
            if (container && itemSchema && !itemSchema.properties) {
                container.innerHTML = '';
                Object.entries(value).forEach(([objKey, objValue]) => {
                    const prop = itemSchema.additionalProperties || { type: 'string' };
                    addObjectKeyValuePair(path, prop, container);
                    
                    // Set the key and value
                    const keyInput = container.lastElementChild.querySelector(`input[data-path="${path}[key]"]`);
                    const valueInput = container.lastElementChild.querySelector(`[data-path="${path}[value]"]`);
                    const warningIcon = container.lastElementChild.querySelector('.warning-icon');
                    
                    if (keyInput) {
                        keyInput.value = objKey;
                        // Update warning visibility
                        if (warningIcon) {
                            warningIcon.style.display = isNumericKey(objKey) ? 'block' : 'none';
                        }
                    }
                    if (valueInput) {
                        if (valueInput.type === 'checkbox') {
                            valueInput.checked = objValue;
                        } else {
                            valueInput.value = objValue;
                        }
                    }
                });
            } else if (value.hasOwnProperty('enabled')) {
                const checkbox = document.querySelector(`input[data-path="${path}.enabled"]`);
                if (checkbox && checkbox.checked !== value.enabled) {
                    checkbox.checked = value.enabled;
                    const event = new Event('change');
                    checkbox.dispatchEvent(event);
                }
            }
            updateFormFromYaml(value, path);
        } else {
            const input = document.querySelector(`input[data-path="${path}"], select[data-path="${path}"]`);
            if (input && input.value !== value.toString()) {
                if (input.type === 'checkbox') {
                    input.checked = value;
                } else {
                    input.value = value;
                }
            }
        }
    });
}

// Find schema definition for a given path
function findSchemaForPath(path) {
    const parts = path.split('.');
    let current = schema;
    
    for (const part of parts) {
        if (part.endsWith('[]')) {
            if (current.type === 'array') {
                current = current.items;
            } else {
                return null;
            }
        } else if (current.properties && current.properties[part]) {
            current = current.properties[part];
        } else {
            return null;
        }
    }
    
    return current;
}

// Update YAML when form changes
function updateYamlFromForm() {
    if (isUpdatingForm) return;
    
    isUpdatingYaml = true;
    const values = getFormValues();
    const yaml = jsyaml.dump(values, { indent: 2 });
    editor.setValue(yaml);
    isUpdatingYaml = false;
}

// Update getFormValues to properly handle object fields
function getFormValues() {
    const values = {};
    
    function processInput(element) {
        const path = element.dataset.path;
        if (!path) return;
        
        let value;
        if (element.type === 'checkbox') {
            if (path.endsWith('.enabled') && !element.checked) {
                return;
            }
            value = element.checked;
        } else if (element.type === 'number') {
            value = element.value ? Number(element.value) : undefined;
        } else if (element.tagName.toLowerCase() === 'select') {
            value = element.value || undefined;
        } else {
            value = element.value || undefined;
        }
        
        if (value === undefined) return;
        
        const parts = path.split('.');
        let current = values;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            
            if (part.endsWith('[]')) {
                const arrayKey = part.slice(0, -2);
                if (!current[arrayKey]) current[arrayKey] = [];
                
                const arrayItem = element.closest('.array-item');
                if (!arrayItem) continue;
                
                const arrayContainer = arrayItem.parentNode;
                const index = Array.from(arrayContainer.children)
                    .filter(el => el.classList.contains('array-item'))
                    .indexOf(arrayItem);
                
                if (isLast) {
                    current[arrayKey][index] = value;
                } else {
                    if (!current[arrayKey][index]) current[arrayKey][index] = {};
                    current = current[arrayKey][index];
                }
            } else if (part.includes('[')) {
                // Handle object key-value pairs
                const objectKey = part.split('[')[0];
                const isKey = part.endsWith('[key]');
                const isValue = part.endsWith('[value]');
                
                if (!current[objectKey]) current[objectKey] = {};
                
                if (isKey) {
                    // Store the key temporarily
                    const itemDiv = element.closest('.key-value-item');
                    if (itemDiv) {
                        const valueInput = itemDiv.querySelector(`[data-path$="[value]"]`);
                        if (valueInput && element.value) {
                            let valueToSet;
                            if (valueInput.type === 'checkbox') {
                                valueToSet = valueInput.checked;
                            } else if (valueInput.type === 'number') {
                                valueToSet = valueInput.value ? Number(valueInput.value) : null;
                            } else {
                                valueToSet = valueInput.value || null;
                            }
                            current[objectKey][element.value] = valueToSet;
                        }
                    }
                }
                // Skip value processing as it's handled with the key
                return;
            } else {
                if (!isLast) {
                    if (!current[part]) current[part] = {};
                    current = current[part];
                } else {
                    current[part] = value;
                }
            }
        }
    }
    
    document.querySelectorAll('input, select').forEach(processInput);
    
    // Clean up empty objects and arrays
    function cleanupEmptyObjects(obj) {
        if (typeof obj !== 'object' || obj === null) return obj;
        
        if (Array.isArray(obj)) {
            const cleanArray = obj.map(item => cleanupEmptyObjects(item))
                .filter(item => {
                    if (item === undefined) return false;
                    if (typeof item === 'object' && Object.keys(item).length === 0) return false;
                    return true;
                });
            return cleanArray.length ? cleanArray : undefined;
        }
        
        const cleaned = {};
        let hasValues = false;
        
        for (const [key, value] of Object.entries(obj)) {
            const cleanValue = cleanupEmptyObjects(value);
            if (cleanValue !== undefined) {
                cleaned[key] = cleanValue;
                hasValues = true;
            }
        }
        
        return hasValues ? cleaned : undefined;
    }
    
    return cleanupEmptyObjects(values) || {};
}

// Remove the global input event listener and update the form change handling
function setupFormChangeHandlers() {
    const formContainer = document.getElementById('form-container');
    
    formContainer.addEventListener('input', (e) => {
        // Skip YAML updates for key inputs while typing
        if (e.target.matches('input[data-path$="[key]"]')) {
            return;
        }
        if (e.target.matches('input, select')) {
            updateYamlFromForm();
        }
    });
    
    formContainer.addEventListener('change', (e) => {
        if (e.target.matches('input[type="checkbox"]')) {
            updateYamlFromForm();
        }
    });
}

// Update the schema loading to use the new setup
fetch('values.schema.json')
    .then(response => response.json())
    .then(data => {
        schema = data;
        generateForm(schema, document.getElementById('form-container'));
        initializeEditor();
        setupFormChangeHandlers();
    })
    .catch(error => console.error('Error loading schema:', error));

function showConfirmationDialog(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    const dialog = document.createElement('div');
    dialog.className = 'confirmation-dialog';
    
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    dialog.appendChild(messageEl);
    
    const buttons = document.createElement('div');
    buttons.className = 'dialog-buttons';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'cancel-btn';
    cancelBtn.onclick = () => {
        document.body.removeChild(overlay);
    };
    buttons.appendChild(cancelBtn);
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm';
    confirmBtn.className = 'confirm-btn';
    confirmBtn.onclick = () => {
        onConfirm();
        document.body.removeChild(overlay);
    };
    buttons.appendChild(confirmBtn);
    
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

// Add new function for creating array sections
function createArraySection(key, prop, currentPath) {
    const arraySection = document.createElement('div');
    arraySection.className = 'array-section';
    
    // Create array header
    const header = document.createElement('div');
    header.className = 'array-header';
    
    const title = document.createElement('div');
    title.className = 'section-title';
    const sectionTitle = formatLabel(key);
    title.textContent = sectionTitle;
    header.appendChild(title);
    
    const controls = document.createElement('div');
    controls.className = 'array-controls';
    
    const arrayContainer = document.createElement('div');
    arrayContainer.id = `${currentPath}-container`;
    arrayContainer.className = 'array-container';
    
    const singularTitle = singularize(sectionTitle);
    const addButton = document.createElement('button');
    addButton.className = 'array-btn';
    addButton.innerHTML = `<span>＋</span> Add ${singularTitle}`;
    addButton.onclick = () => {
        addArrayItem(currentPath, prop.items, arrayContainer, singularTitle);
        updateRemoveAllVisibility(arrayContainer, removeAllButton);
    };
    controls.appendChild(addButton);
    
    const removeAllButton = document.createElement('button');
    removeAllButton.className = 'array-btn danger remove-all';
    removeAllButton.innerHTML = '<span>×</span> Remove All';
    removeAllButton.onclick = () => {
        if (arrayContainer.children.length > 0) {
            showConfirmationDialog('Are you sure you want to remove all items?', () => {
                arrayContainer.innerHTML = '';
                updateRemoveAllVisibility(arrayContainer, removeAllButton);
                if (!isUpdatingArrays) {
                    updateYamlFromForm();
                }
            });
        }
    };
    controls.appendChild(removeAllButton);
    
    header.appendChild(controls);
    arraySection.appendChild(header);
    arraySection.appendChild(arrayContainer);
    
    return arraySection;
}

// Update generateForm to use the new createArraySection function
function generateForm(schema, container, path = '') {
    if (!schema.properties) return;

    // Group properties by type
    const properties = Object.entries(schema.properties);
    const values = [];
    const arrays = [];
    const objects = [];
    const normalSections = [];
    const enableableSections = [];

    properties.forEach(([key, prop]) => {
        if (key === 'enabled' && path.includes('.')) {
            return; // Skip enabled properties that are already handled
        }

        if (prop.type === 'object') {
            if (prop.properties) {
                if (prop.properties.hasOwnProperty('enabled')) {
                    enableableSections.push([key, prop]);
                } else {
                    normalSections.push([key, prop]);
                }
            } else {
                // This is a free-form object field
                objects.push([key, prop]);
            }
        } else if (prop.type === 'array') {
            arrays.push([key, prop]);
        } else {
            values.push([key, prop]);
        }
    });

    // Sort each group alphabetically by their formatted labels
    const sortByLabel = (a, b) => formatLabel(a[0]).localeCompare(formatLabel(b[0]));
    values.sort(sortByLabel);
    arrays.sort(sortByLabel);
    objects.sort(sortByLabel);
    normalSections.sort(sortByLabel);
    enableableSections.sort(sortByLabel);

    // Create a single form-group for all values if there are any
    if (values.length > 0) {
        const valuesGroup = document.createElement('div');
        valuesGroup.className = 'form-group';
        
        values.forEach(([key, prop]) => {
            const content = document.createElement('div');
            content.className = 'section-content';
            
            const label = document.createElement('div');
            label.className = 'section-title';
            label.textContent = formatLabel(key);
            content.appendChild(label);
            
            const input = createInput(prop, path ? `${path}.${key}` : key);
            content.appendChild(input);
            valuesGroup.appendChild(content);
        });
        
        container.appendChild(valuesGroup);
    }

    // Generate arrays, objects, and sections
    [...arrays, ...objects, ...normalSections, ...enableableSections].forEach(([key, prop]) => {
        const currentPath = path ? `${path}.${key}` : key;
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        if (prop.type === 'object' && !prop.properties) {
            // This is a free-form object field
            formGroup.appendChild(createObjectSection(key, prop, currentPath));
        } else if (prop.type === 'object' && prop.properties) {
            // Create header section
            const header = document.createElement('div');
            header.className = 'section-header';
            
            const title = document.createElement('div');
            title.className = 'section-title';
            title.textContent = formatLabel(key);
            header.appendChild(title);

            // Create controls container
            const controls = document.createElement('div');
            controls.className = 'controls';
            
            // Check if this object has an 'enabled' property
            const hasEnabled = prop.properties.hasOwnProperty('enabled');
            let enabledCheckbox = null;

            if (hasEnabled) {
                enabledCheckbox = document.createElement('input');
                enabledCheckbox.type = 'checkbox';
                enabledCheckbox.id = `${currentPath}.enabled`;
                enabledCheckbox.dataset.path = `${currentPath}.enabled`;
                enabledCheckbox.className = 'section-enabled';
                controls.appendChild(enabledCheckbox);
            }

            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = '▶';
            toggleBtn.className = 'toggle-btn';
            if (!hasEnabled) {
                toggleBtn.classList.add('visible');
            }
            controls.appendChild(toggleBtn);
            header.appendChild(controls);
            formGroup.appendChild(header);

            // Create content section
            const content = document.createElement('div');
            content.className = 'section-content collapsed';
            
            const nestedContainer = document.createElement('div');
            nestedContainer.className = 'nested-form';
            content.appendChild(nestedContainer);
            formGroup.appendChild(content);

            // Function to toggle section
            const toggleSection = (e) => {
                if (e.target === enabledCheckbox) return;
                
                if (!hasEnabled || (hasEnabled && enabledCheckbox.checked)) {
                    content.classList.toggle('collapsed');
                    toggleBtn.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
                } else if (!enabledCheckbox.checked) {
                    enabledCheckbox.checked = true;
                    toggleBtn.classList.add('visible');
                    content.classList.remove('collapsed');
                    toggleBtn.textContent = '▼';
                }
            };

            // Add click handler to the header
            header.addEventListener('click', toggleSection);

            // Generate form for all properties except 'enabled'
            const nestedSchema = { ...prop };
            if (hasEnabled) {
                delete nestedSchema.properties.enabled;
                
                // Add event listener to enabledCheckbox
                enabledCheckbox.addEventListener('change', (e) => {
                    const isEnabled = e.target.checked;
                    if (!isEnabled) {
                        showConfirmationDialog('Are you sure you want to disable this section? All values will be cleared.', () => {
                            toggleBtn.classList.toggle('visible', isEnabled);
                            content.classList.add('collapsed');
                            toggleBtn.textContent = '▶';
                            // TODO: Clear all values in this section
                        });
                        e.preventDefault(); // Prevent immediate unchecking
                    } else {
                        toggleBtn.classList.toggle('visible', isEnabled);
                        content.classList.remove('collapsed');
                        toggleBtn.textContent = '▼';
                    }
                });
            }

            generateForm(nestedSchema, nestedContainer, currentPath);
        } else if (prop.type === 'array') {
            formGroup.appendChild(createArraySection(key, prop, currentPath));
        }

        container.appendChild(formGroup);
    });
}

// Get default value for a path
function getDefaultValue(path) {
    if (!defaultValues) return undefined;
    
    const parts = path.split('.');
    let current = defaultValues;
    
    for (const part of parts) {
        if (part.endsWith('[]')) {
            // Array items don't have default values
            return undefined;
        }
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return undefined;
        }
    }
    
    return current;
}

function createInput(prop, path) {
    const defaultValue = getDefaultValue(path);
    
    if (prop.type === 'boolean') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = path;
        input.dataset.path = path;
        if (defaultValue !== undefined) {
            input.checked = defaultValue;
        }
        return input;
    } else if (prop.enum) {
        const select = document.createElement('select');
        select.id = path;
        select.dataset.path = path;
        
        // Add an empty option first
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Select --';
        select.appendChild(emptyOption);
        
        prop.enum.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            if (defaultValue === value) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        return select;
    } else {
        const input = document.createElement('input');
        input.type = prop.type === 'integer' || prop.type === 'number' ? 'number' : 'text';
        input.id = path;
        input.dataset.path = path;
        
        if (prop.minimum !== undefined) input.min = prop.minimum;
        if (prop.maximum !== undefined) input.max = prop.maximum;
        
        // Set placeholder to default value if it exists
        if (defaultValue !== undefined && defaultValue !== null) {
            input.placeholder = defaultValue;
        }
        
        return input;
    }
}

// Add new function to update reorder buttons
function smoothlyReorderArrayItems(container, movingItem, targetItem, direction) {
    // Get the positions and heights
    const movingRect = movingItem.getBoundingClientRect();
    const targetRect = targetItem.getBoundingClientRect();
    const distance = direction === 'up' ? -(movingRect.top - targetRect.top) : (targetRect.top - movingRect.top);
    
    // Set initial states
    movingItem.style.zIndex = '2';
    targetItem.style.zIndex = '1';
    movingItem.style.position = 'relative';
    targetItem.style.position = 'relative';
    movingItem.style.transition = 'transform 0.3s ease-in-out';
    targetItem.style.transition = 'transform 0.3s ease-in-out';
    
    // Start animation
    movingItem.style.transform = `translateY(${distance}px)`;
    targetItem.style.transform = `translateY(${-distance}px)`;
    
    // After animation completes
    setTimeout(() => {
        // Reset styles
        movingItem.style.transform = '';
        targetItem.style.transform = '';
        movingItem.style.position = '';
        targetItem.style.position = '';
        movingItem.style.zIndex = '';
        targetItem.style.zIndex = '';
        movingItem.style.transition = '';
        targetItem.style.transition = '';
        
        // Actually reorder the DOM elements
        if (direction === 'up') {
            container.insertBefore(movingItem, targetItem);
        } else {
            container.insertBefore(targetItem, movingItem);
        }
        
        // Update controls and YAML
        updateArrayItemControls(container);
        updateArrayItemTitles(container, movingItem.querySelector('.array-item-type').textContent);
        updateYamlFromForm();
    }, 300); // Match the transition duration
}

function updateArrayItemControls(container) {
    const items = Array.from(container.children);
    items.forEach((item, index) => {
        const controls = item.querySelector('.array-item-controls');
        if (!controls) return;
        
        // Remove existing move buttons
        controls.querySelectorAll('.move-btn').forEach(btn => btn.remove());
        
        // Add appropriate move buttons based on position
        if (index > 0) {
            const moveUpBtn = document.createElement('button');
            moveUpBtn.className = 'array-btn move-btn';
            moveUpBtn.innerHTML = '↑';
            moveUpBtn.onclick = (e) => {
                e.stopPropagation();
                const targetItem = items[index - 1];
                smoothlyReorderArrayItems(container, item, targetItem, 'up');
            };
            controls.insertBefore(moveUpBtn, controls.firstChild);
        }
        
        if (index < items.length - 1) {
            const moveDownBtn = document.createElement('button');
            moveDownBtn.className = 'array-btn move-btn';
            moveDownBtn.innerHTML = '↓';
            moveDownBtn.onclick = (e) => {
                e.stopPropagation();
                const targetItem = items[index + 1];
                smoothlyReorderArrayItems(container, item, targetItem, 'down');
            };
            if (index === 0) {
                controls.insertBefore(moveDownBtn, controls.firstChild);
            } else {
                controls.insertBefore(moveDownBtn, controls.querySelector('.array-btn.danger'));
            }
        }
    });
}

// Update addArrayItem to use the new control update function
function addArrayItem(path, itemSchema, container, itemType) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'array-item';
    
    const header = document.createElement('div');
    header.className = 'array-item-header';
    
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'array-item-title';
    titleWrapper.textContent = `${itemType} ${container.children.length + 1}`;
    header.appendChild(titleWrapper);

    const typeLabel = document.createElement('span');
    typeLabel.className = 'array-item-type';
    typeLabel.textContent = itemType;
    header.appendChild(typeLabel);
    
    const controls = document.createElement('div');
    controls.className = 'array-item-controls';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'array-btn danger';
    removeBtn.innerHTML = '<span>×</span>';
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        showConfirmationDialog('Are you sure you want to remove this item?', () => {
            itemDiv.remove();
            updateArrayItemControls(container);
            updateArrayItemTitles(container, itemType);
            updateYamlFromForm();
            // Find and update the Remove All button visibility
            const arraySection = container.closest('.array-section');
            const removeAllButton = arraySection.querySelector('.array-btn.remove-all');
            updateRemoveAllVisibility(container, removeAllButton);
        });
    };
    controls.appendChild(removeBtn);
    
    header.appendChild(controls);
    itemDiv.appendChild(header);
    
    const content = document.createElement('div');
    content.className = 'array-item-content';
    
    if (itemSchema.type === 'object') {
        generateForm(itemSchema, content, `${path}[]`);
        
        if (itemSchema.properties && itemSchema.properties.name) {
            const nameInput = content.querySelector(`input[data-path="${path}[].name"]`);
            if (nameInput) {
                nameInput.addEventListener('input', () => {
                    titleWrapper.textContent = nameInput.value || `${itemType} ${Array.from(container.children).indexOf(itemDiv) + 1}`;
                    if (!isUpdatingArrays) {
                        updateYamlFromForm();
                    }
                });
            }
        }
    } else {
        const input = createInput(itemSchema, `${path}[]`);
        input.addEventListener('input', () => {
            if (!isUpdatingArrays) {
                updateYamlFromForm();
            }
        });
        content.appendChild(input);
    }
    
    itemDiv.appendChild(content);
    container.appendChild(itemDiv);
    
    header.addEventListener('click', (e) => {
        if (!e.target.closest('.array-item-controls')) {
            content.classList.toggle('collapsed');
        }
    });
    
    // Update the Remove All button visibility
    const arraySection = container.closest('.array-section');
    const removeAllButton = arraySection.querySelector('.array-btn.remove-all');
    updateRemoveAllVisibility(container, removeAllButton);
    
    // Update reorder buttons for all items
    updateArrayItemControls(container);
}

function updateArrayItemTitles(container, itemType) {
    Array.from(container.children).forEach((item, index) => {
        const title = item.querySelector('.array-item-header .array-item-title');
        const nameInput = item.querySelector('input[data-path$="name"]');
        title.textContent = nameInput && nameInput.value ? nameInput.value : `${itemType} ${index + 1}`;
    });
}

function formatLabel(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

document.getElementById('download-btn').addEventListener('click', () => {
    const yaml = editor.getValue();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'values.yaml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

document.getElementById('reset-btn').addEventListener('click', () => {
    showConfirmationDialog('Are you sure you want to reset the form? All values will be cleared.', () => {
        document.querySelectorAll('input, select').forEach(element => {
            if (element.type === 'checkbox') {
                element.checked = false;
            } else {
                element.value = '';
            }
        });
        
        document.querySelectorAll('.array-container').forEach(container => {
            container.innerHTML = '';
            const arraySection = container.closest('.array-section');
            const removeAllButton = arraySection.querySelector('.array-btn.remove-all');
            updateRemoveAllVisibility(container, removeAllButton);
        });

        document.querySelectorAll('.section-content:not(.collapsed)').forEach(section => {
            section.classList.add('collapsed');
            const header = section.previousElementSibling;
            if (header) {
                const toggleBtn = header.querySelector('.toggle-btn');
                if (toggleBtn) {
                    toggleBtn.textContent = '▶';
                }
            }
        });

        editor.setValue('');
    });
});

function singularize(word) {
    // Basic singularization rules - extend as needed
    if (word.endsWith('ies')) {
        return word.slice(0, -3) + 'y';
    } else if (word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    return word;
}

function updateRemoveAllVisibility(container, removeAllButton) {
    if (container.children.length > 0) {
        removeAllButton.classList.add('visible');
    } else {
        removeAllButton.classList.remove('visible');
    }
}

// Update getArrayValues to only include non-empty items
function getArrayValues(container, path) {
    const values = [];
    container.querySelectorAll('.array-item').forEach(item => {
        if (item.querySelector(`input[data-path^="${path}[]"], select[data-path^="${path}[]"]`)) {
            const itemValues = {};
            let hasValue = false;
            
            item.querySelectorAll('input, select').forEach(input => {
                const inputPath = input.dataset.path;
                if (inputPath && inputPath.startsWith(`${path}[]`)) {
                    const key = inputPath.replace(`${path}[].`, '').replace(`${path}[]`, '');
                    let value;
                    
                    if (input.type === 'checkbox') {
                        value = input.checked;
                    } else if (input.tagName.toLowerCase() === 'select') {
                        value = input.value || undefined;
                    } else {
                        value = input.value || undefined;
                    }
                    
                    if (value !== undefined) {
                        hasValue = true;
                        if (key) {
                            itemValues[key] = value;
                        } else {
                            values.push(value);
                            return; // Exit early for primitive array items
                        }
                    }
                }
            });
            
            if (hasValue && Object.keys(itemValues).length > 0) {
                values.push(itemValues);
            }
        }
    });
    return values;
}

function createObjectSection(key, prop, currentPath) {
    const objectSection = document.createElement('div');
    objectSection.className = 'array-section'; // Reuse array styling

    // Create object header
    const header = document.createElement('div');
    header.className = 'array-header';
    
    const title = document.createElement('div');
    title.className = 'section-title';
    const sectionTitle = formatLabel(key);
    title.textContent = sectionTitle;
    header.appendChild(title);
    
    const controls = document.createElement('div');
    controls.className = 'array-controls';
    
    const objectContainer = document.createElement('div');
    objectContainer.id = `${currentPath}-container`;
    objectContainer.className = 'array-container';
    
    const addButton = document.createElement('button');
    addButton.className = 'array-btn';
    addButton.innerHTML = `<span>＋</span> Add Key/Value Pair`;
    addButton.onclick = () => {
        addObjectKeyValuePair(currentPath, prop, objectContainer);
        updateRemoveAllVisibility(objectContainer, removeAllButton);
    };
    controls.appendChild(addButton);
    
    const removeAllButton = document.createElement('button');
    removeAllButton.className = 'array-btn danger remove-all';
    removeAllButton.innerHTML = '<span>×</span> Remove All';
    removeAllButton.onclick = () => {
        if (objectContainer.children.length > 0) {
            showConfirmationDialog('Are you sure you want to remove all key/value pairs?', () => {
                objectContainer.innerHTML = '';
                updateRemoveAllVisibility(objectContainer, removeAllButton);
                updateYamlFromForm();
            });
        }
    };
    controls.appendChild(removeAllButton);
    
    header.appendChild(controls);
    objectSection.appendChild(header);
    objectSection.appendChild(objectContainer);
    
    return objectSection;
}

function updateObjectItemControls(container) {
    // First, sort items so numeric keys are at the top
    sortObjectItems(container);

    const items = Array.from(container.children);
    items.forEach((item, index) => {
        const controls = item.querySelector('.key-value-controls');
        if (!controls) return;
        
        // Remove existing move buttons
        controls.querySelectorAll('.move-btn').forEach(btn => btn.remove());
        
        // Get the key input value and update warning visibility
        const keyInput = item.querySelector('input[data-path$="[key]"]');
        const warningIcon = item.querySelector('.warning-icon');
        if (keyInput && warningIcon) {
            warningIcon.style.display = isNumericKey(keyInput.value) ? 'block' : 'none';
        }
        
        if (!keyInput || isNumericKey(keyInput.value)) {
            return; // Skip adding reorder controls for numeric keys
        }
        
        // Find the range of non-numeric items for reordering
        const nonNumericItems = items.filter(i => {
            const key = i.querySelector('input[data-path$="[key]"]')?.value;
            return !isNumericKey(key);
        });
        const nonNumericIndex = nonNumericItems.indexOf(item);
        
        if (nonNumericIndex > 0) {
            const moveUpBtn = document.createElement('button');
            moveUpBtn.className = 'array-btn move-btn';
            moveUpBtn.innerHTML = '↑';
            moveUpBtn.onclick = (e) => {
                e.stopPropagation();
                const targetItem = nonNumericItems[nonNumericIndex - 1];
                smoothlyReorderKeyValueItems(container, item, targetItem, 'up');
            };
            controls.insertBefore(moveUpBtn, controls.firstChild);
        }
        
        if (nonNumericIndex < nonNumericItems.length - 1) {
            const moveDownBtn = document.createElement('button');
            moveDownBtn.className = 'array-btn move-btn';
            moveDownBtn.innerHTML = '↓';
            moveDownBtn.onclick = (e) => {
                e.stopPropagation();
                const targetItem = nonNumericItems[nonNumericIndex + 1];
                smoothlyReorderKeyValueItems(container, item, targetItem, 'down');
            };
            if (nonNumericIndex === 0) {
                controls.insertBefore(moveDownBtn, controls.firstChild);
            } else {
                controls.insertBefore(moveDownBtn, controls.querySelector('.array-btn.danger'));
            }
        }
    });
}

function isNumericKey(key) {
    return /^\d+$/.test(key);
}

function sortObjectItems(container, changedItem = null) {
    // Only proceed if we have a changed item
    if (!changedItem) return;

    // Get current list and positions
    const items = Array.from(container.children);
    const currentPositions = new Map();
    items.forEach(item => {
        const rect = item.getBoundingClientRect();
        currentPositions.set(item, rect.top);
    });
    
    // Update warning visibility for all items
    items.forEach(item => {
        const keyInput = item.querySelector('input[data-path$="[key]"]');
        const warningIcon = item.querySelector('.warning-icon');
        if (keyInput && warningIcon) {
            warningIcon.style.display = isNumericKey(keyInput.value) ? 'block' : 'none';
        }
    });
    
    // Get current index of changed item
    const oldIndex = items.indexOf(changedItem);
    
    // Calculate new sorted order
    const sortedItems = [...items].sort((a, b) => {
        const keyA = a.querySelector('input[data-path$="[key]"]')?.value;
        const keyB = b.querySelector('input[data-path$="[key]"]')?.value;
        
        const isNumA = isNumericKey(keyA);
        const isNumB = isNumericKey(keyB);
        
        if (isNumA && isNumB) {
            return parseInt(keyA) - parseInt(keyB);
        } else if (isNumA) {
            return -1;
        } else if (isNumB) {
            return 1;
        }
        return 0;
    });

    // Find new position of changed item
    const newIndex = sortedItems.indexOf(changedItem);
    
    // If position hasn't changed, do nothing
    if (newIndex === oldIndex) return;
    
    // Calculate the height of one item (assuming all items are same height)
    const itemHeight = changedItem.offsetHeight;
    
    // Determine if we're moving up or down
    const isMovingUp = newIndex < oldIndex;
    
    // First, set all items to a base z-index
    items.forEach(item => {
        item.style.zIndex = '1';
    });
    
    // Set changed item to highest z-index and prepare for animation
    changedItem.style.zIndex = '100'; // Much higher to ensure it's always on top
    changedItem.style.position = 'relative'; // Ensure z-index works
    changedItem.style.transition = 'transform 0.3s ease-in-out';
    
    // Prepare animations
    if (isMovingUp) {
        // Moving up: items between new and old position need to move down
        items.forEach((item, index) => {
            if (index >= newIndex && index < oldIndex) {
                if (item === changedItem) return;
                
                item.style.position = 'relative'; // Ensure z-index works
                item.style.transition = 'transform 0.3s ease-in-out';
                item.style.transform = `translateY(${itemHeight}px)`;
            }
        });
        
        // Changed item moves up
        const distance = -(oldIndex - newIndex) * itemHeight;
        changedItem.style.transform = `translateY(${distance}px)`;
    } else {
        // Moving down: items between old and new position need to move up
        items.forEach((item, index) => {
            if (index > oldIndex && index <= newIndex) {
                if (item === changedItem) return;
                
                item.style.position = 'relative'; // Ensure z-index works
                item.style.transition = 'transform 0.3s ease-in-out';
                item.style.transform = `translateY(-${itemHeight}px)`;
            }
        });
        
        // Changed item moves down
        const distance = (newIndex - oldIndex) * itemHeight;
        changedItem.style.transform = `translateY(${distance}px)`;
    }
    
    // After animation completes, update DOM and reset styles
    setTimeout(() => {
        // Reset all transforms before reordering
        items.forEach(item => {
            item.style.transform = '';
            item.style.transition = '';
            item.style.zIndex = '';
            item.style.position = '';
        });
        
        // Reorder DOM
        sortedItems.forEach(item => container.appendChild(item));
    }, 300);
}

function smoothlyReorderKeyValueItems(container, movingItem, targetItem, direction) {
    // Get the positions and heights
    const movingRect = movingItem.getBoundingClientRect();
    const targetRect = targetItem.getBoundingClientRect();
    const distance = direction === 'up' ? -(movingRect.top - targetRect.top) : (targetRect.top - movingRect.top);
    
    // Set initial states
    movingItem.style.zIndex = '2';
    targetItem.style.zIndex = '1';
    movingItem.style.position = 'relative';
    targetItem.style.position = 'relative';
    movingItem.style.transition = 'transform 0.3s ease-in-out';
    targetItem.style.transition = 'transform 0.3s ease-in-out';
    
    // Start animation
    movingItem.style.transform = `translateY(${distance}px)`;
    targetItem.style.transform = `translateY(${-distance}px)`;
    
    // After animation completes
    setTimeout(() => {
        // Reset styles
        movingItem.style.transform = '';
        targetItem.style.transform = '';
        movingItem.style.position = '';
        targetItem.style.position = '';
        movingItem.style.zIndex = '';
        targetItem.style.zIndex = '';
        movingItem.style.transition = '';
        targetItem.style.transition = '';
        
        // Actually reorder the DOM elements
        if (direction === 'up') {
            container.insertBefore(movingItem, targetItem);
        } else {
            container.insertBefore(targetItem, movingItem);
        }
        
        // Update controls and YAML
        updateObjectItemControls(container);
        updateYamlFromForm();
    }, 300); // Match the transition duration
}

// Update addObjectKeyValuePair to use the new reordering function
function addObjectKeyValuePair(path, prop, container) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'key-value-item';
    
    // Create key input wrapper
    const keyWrapper = document.createElement('div');
    keyWrapper.className = 'key-input-wrapper';
    
    // Create key input
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Key';
    keyInput.className = 'key-input';
    keyInput.dataset.path = `${path}[key]`;
    
    // Create warning icon for numeric keys
    const warningIcon = document.createElement('span');
    warningIcon.className = 'warning-icon';
    warningIcon.innerHTML = '⚠'; // Unicode warning triangle
    warningIcon.dataset.tooltip = 'Numerical keys will be automatically sorted and cannot be reordered';
    warningIcon.style.display = 'none';

    // Create error icon for duplicate keys
    const errorIcon = document.createElement('span');
    errorIcon.className = 'error-icon';
    errorIcon.innerHTML = '⛔'; // Unicode no entry sign
    errorIcon.dataset.tooltip = 'Duplicate keys are not supported';
    errorIcon.style.display = 'none';
    
    // Function to check for duplicate keys
    const checkDuplicateKey = (value) => {
        if (!value) return false;
        const items = Array.from(container.children);
        return items.some(item => {
            if (item === itemDiv) return false; // Skip current item
            const otherKeyInput = item.querySelector('input[data-path$="[key]"]');
            return otherKeyInput && otherKeyInput.value === value;
        });
    };
    
    let isDuplicateState = false;  // Track duplicate state
    
    // Add input handlers
    keyInput.addEventListener('input', () => {
        const value = keyInput.value;
        
        if (value) {  // Only update states if there's a value
            const isNumeric = isNumericKey(value);
            
            // Clear duplicate state when user types a new value
            if (isDuplicateState) {
                isDuplicateState = false;
                errorIcon.style.display = 'none';
                keyInput.classList.remove('error');
            }
            
            // Show/hide numeric warning
            warningIcon.style.display = isNumeric ? 'block' : 'none';
        } else {
            // Only hide warning if the field is empty
            warningIcon.style.display = 'none';
            errorIcon.style.display = 'none';
            keyInput.classList.remove('error');
            isDuplicateState = false;
        }
    });
    
    keyInput.addEventListener('blur', () => {
        const value = keyInput.value;
        if (!value) return;  // Don't check empty values
        
        const isDuplicate = checkDuplicateKey(value);
        const isNumeric = isNumericKey(value);
        
        // Handle duplicate keys
        if (isDuplicate) {
            isDuplicateState = true;
            errorIcon.style.display = 'block';
            warningIcon.style.display = 'none'; // Hide warning when showing error
            keyInput.value = ''; // Clear the duplicate value
            keyInput.classList.add('error');
            keyInput.focus();
            // Do NOT update YAML for duplicates
        } else {
            // Show numeric warning if applicable
            warningIcon.style.display = isNumeric ? 'block' : 'none';
            // Only sort and update YAML if there's no duplicate
            sortObjectItems(container, itemDiv);
            updateObjectItemControls(container);
            updateYamlFromForm(); // Move YAML update here, only for valid keys
        }
    });
    
    // Add elements to wrapper
    keyWrapper.appendChild(keyInput);
    keyWrapper.appendChild(warningIcon);
    keyWrapper.appendChild(errorIcon);
    itemDiv.appendChild(keyWrapper);
    
    // Add separator
    const separator = document.createElement('span');
    separator.className = 'key-value-separator';
    separator.textContent = ':';
    itemDiv.appendChild(separator);
    
    // Create value input based on additionalProperties or default to string
    const valueType = prop.additionalProperties || { type: 'string' };
    const valueInput = createInput(valueType, `${path}[value]`);
    if (valueInput.tagName.toLowerCase() !== 'select') {
        valueInput.placeholder = 'Value';
    }
    itemDiv.appendChild(valueInput);
    
    // Create controls
    const controls = document.createElement('div');
    controls.className = 'key-value-controls';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'array-btn danger';
    removeBtn.innerHTML = '<span>×</span>';
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        showConfirmationDialog('Are you sure you want to remove this key/value pair?', () => {
            itemDiv.remove();
            updateObjectItemControls(container);
            updateYamlFromForm();
            const objectSection = container.closest('.array-section');
            const removeAllButton = objectSection.querySelector('.array-btn.remove-all');
            updateRemoveAllVisibility(container, removeAllButton);
        });
    };
    controls.appendChild(removeBtn);
    
    itemDiv.appendChild(controls);
    container.appendChild(itemDiv);
    
    const objectSection = container.closest('.array-section');
    const removeAllButton = objectSection.querySelector('.array-btn.remove-all');
    updateRemoveAllVisibility(container, removeAllButton);
    
    updateObjectItemControls(container);
    
    // Update styles to include error icon and input styles
    if (!document.getElementById('warning-icon-styles')) {
        const styles = document.createElement('style');
        styles.id = 'warning-icon-styles';
        styles.textContent = `
            .key-input-wrapper {
                position: relative;
                display: inline-flex;
                align-items: center;
            }
            .key-input {
                width: 100%;
            }
            .key-input.error {
                border-color: #dc3545;
                background-color: #fff8f8;
            }
            .warning-icon, .error-icon {
                position: absolute;
                right: 8px;
                cursor: help;
                font-size: 14px;
                display: none;
            }
            .warning-icon {
                color: #f0ad4e;
            }
            .error-icon {
                color: #dc3545;
            }
            .warning-icon:hover::after,
            .error-icon:hover::after {
                content: attr(data-tooltip);
                position: absolute;
                background: #333;
                color: white;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 1000;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                margin-bottom: 5px;
            }
            .warning-icon:hover::before,
            .error-icon:hover::before {
                content: '';
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                border: 5px solid transparent;
                border-top-color: #333;
                margin-bottom: -5px;
            }
        `;
        document.head.appendChild(styles);
    }
}

function updateObjectItemTitles(container) {
    Array.from(container.children).forEach((item, index) => {
        const title = item.querySelector('.array-item-header .array-item-title');
        const keyInput = item.querySelector('input[data-path$="[key]"]');
        title.textContent = keyInput && keyInput.value ? keyInput.value : `Key/Value Pair ${index + 1}`;
    });
} 