let schema = null;
let editor = null;
let isUpdatingYaml = false;
let isUpdatingForm = false;
let isUpdatingArrays = false;
let defaultValues = null;
let overriddenFields = new Set();

document.getElementById('download-btn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([editor.getValue()], { type: 'text/yaml' }));
    a.download = 'values.yaml';
    a.click();
});

// Debounce the sort and control updates
const debouncedSortAndUpdate = debounce((container) => {
    sortObjectItems(container);
    updateObjectItemControls(container);
}, 300);

// Load default values from values.yaml
fetch('values.yaml')
    .then(response => response.text())
    .then(yaml => {
        defaultValues = jsyaml.load(yaml);
    })
    .catch(error => console.error('Error loading default values:', error));

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
                    
                    // Update array item titles after all items are added
                    updateArrayItemTitles(container, singularize(formatLabel(key)));
                    
                    isUpdatingArrays = false;
                }
            }
        } else if (typeof value === 'object' && value !== null) {
            if (value.hasOwnProperty('enabled')) {
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
    
    // Check if values object is empty
    if (Object.keys(values).length === 0) {
        editor.setValue('');
    } else {
        const yaml = jsyaml.dump(values, { indent: 2 });
        editor.setValue(yaml);
    }
    
    isUpdatingYaml = false;
}

// Update getFormValues to properly handle object fields
function getFormValues() {
    const values = {};
    
    function processInput(element) {
        const path = element.dataset.path;
        if (!path) return;
        
        // Check if this input is within a disabled section
        const parts = path.split('.');
        let parentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
            if (i > 0) parentPath += '.';
            parentPath += parts[i];
            
            // Skip array indices
            if (parts[i].endsWith('[]')) continue;
            
            const enabledCheckbox = document.querySelector(`input[data-path="${parentPath}.enabled"]`);
            if (enabledCheckbox && !enabledCheckbox.checked) {
                // If any parent section is disabled, skip this value
                // Unless it's the enabled property itself
                if (!path.endsWith('.enabled')) {
                    return;
                }
            }
        }
        
        let value;
        if (element.type === 'checkbox') {
            value = element.checked;
        } else if (element.type === 'number') {
            value = element.value ? Number(element.value) : undefined;
        } else if (element.tagName.toLowerCase() === 'select') {
            value = element.value || undefined;
        } else {
            // Special handling for key-value pair values
            if (path.endsWith('[value]')) {
                const trimmedValue = (element.value || '').trim();
                if (!trimmedValue) {
                    const wrapper = element.closest('.value-input-wrapper');
                    if (wrapper) {
                        const warningIcon = wrapper.querySelector('.empty-value-warning');
                        if (warningIcon && warningIcon.dataset.mode === 'empty') {
                            value = ''; // Use empty string
                        } else {
                            value = null; // Explicitly use null instead of undefined
                        }
                    } else {
                        value = null;
                    }
                } else {
                    value = element.value;
                }
            } else {
                value = element.value || undefined;
            }
        }
        
        // Include value if it's overridden, even if it matches default
        if (value === undefined && overriddenFields.has(path)) {
            const defaultValue = getDefaultValue(path);
            if (defaultValue !== undefined) {
                value = defaultValue;
            }
        }
        
        if (value === undefined && !overriddenFields.has(path)) return;
        
        // Process the path parts to build the values object
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
                                // Handle empty value modes for key-value pairs
                                const trimmedValue = (valueInput.value || '').trim();
                                if (!trimmedValue) {
                                    const wrapper = valueInput.closest('.value-input-wrapper');
                                    if (wrapper) {
                                        const warningIcon = wrapper.querySelector('.empty-value-warning');
                                        if (warningIcon && warningIcon.dataset.mode === 'empty') {
                                            valueToSet = ''; // Use empty string
                                        } else {
                                            valueToSet = null; // Explicitly use null
                                        }
                                    } else {
                                        valueToSet = null;
                                    }
                                } else {
                                    valueToSet = valueInput.value;
                                }
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
                    // Check if we should include this value
                    const defaultValue = getDefaultValue(path);
                    if (value === defaultValue && !overriddenFields.has(path)) {
                        return;
                    }
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

function showConfirmationDialog(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    const dialog = document.createElement('div');
    dialog.className = 'confirmation-dialog';
    dialog.style.position = 'fixed';
    dialog.style.top = '50%';
    dialog.style.left = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.zIndex = '1000';
    
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style.marginBottom = '0.5rem';
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

    // Focus the cancel button by default for better keyboard navigation
    cancelBtn.focus();

    // Handle Escape key to close dialog
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
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
            
            if (prop.type === 'boolean') {
                // Special handling for boolean/checkbox inputs
                content.style.display = 'flex';
                content.style.justifyContent = 'space-between';
                content.style.alignItems = 'center';
                
                const label = document.createElement('div');
                label.className = 'section-title';
                label.style.margin = '0';
                label.textContent = formatLabel(key);
                
                // Add click handler for override
                const fieldPath = path ? `${path}.${key}` : key;
                label.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleOverride(fieldPath, label);
                });
                
                // Set initial override state
                if (overriddenFields.has(fieldPath)) {
                    label.classList.add('overridden');
                }
                
                content.appendChild(label);
                
                const input = createInput(prop, fieldPath);
                content.appendChild(input);
            } else {
                // Standard handling for other input types
                const label = document.createElement('div');
                label.className = 'section-title';
                label.textContent = formatLabel(key);
                
                // Add click handler for override
                const fieldPath = path ? `${path}.${key}` : key;
                label.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleOverride(fieldPath, label);
                });
                
                // Set initial override state
                if (overriddenFields.has(fieldPath)) {
                    label.classList.add('overridden');
                }
                
                content.appendChild(label);
                
                const input = createInput(prop, fieldPath);
                content.appendChild(input);
            }
            
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

            // Create checkbox first if section has enabled property
            if (hasEnabled) {
                enabledCheckbox = document.createElement('input');
                enabledCheckbox.type = 'checkbox';
                enabledCheckbox.id = `${currentPath}.enabled`;
                enabledCheckbox.dataset.path = `${currentPath}.enabled`;
                enabledCheckbox.className = 'section-enabled';
                
                // Set default value if it exists
                const defaultValue = getDefaultValue(`${currentPath}.enabled`);
                if (defaultValue !== undefined) {
                    enabledCheckbox.checked = defaultValue;
                }
                
                controls.appendChild(enabledCheckbox);
            }

            // Create toggle button after checkbox
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'toggle-btn';
            if (!hasEnabled || (hasEnabled && enabledCheckbox.checked)) {
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
                    toggleBtn.classList.toggle('expanded');
                } else if (!enabledCheckbox.checked) {
                    enabledCheckbox.checked = true;
                    toggleBtn.classList.add('visible');
                    content.classList.remove('collapsed');
                    toggleBtn.classList.add('expanded');
                    // Update YAML when enabling via section click
                    updateYamlFromForm();
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
                            toggleBtn.classList.remove('expanded');
                        });
                        e.preventDefault(); // Prevent immediate unchecking
                    } else {
                        toggleBtn.classList.toggle('visible', isEnabled);
                        content.classList.remove('collapsed');
                        toggleBtn.classList.add('expanded');
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
    
    // Handle type coercion for proper comparison
    if (current !== undefined && current !== null) {
        if (typeof current === 'string' && current !== '' && !isNaN(current)) {
            // Convert numeric strings to numbers, but preserve empty strings
            return Number(current);
        } else if (typeof current === 'boolean') {
            // Ensure booleans stay as booleans
            return Boolean(current);
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
        
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select...';
        select.appendChild(defaultOption);
        
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
        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';

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

        // Create pin icon
        const pinIcon = document.createElement('span');
        pinIcon.className = 'pin-icon';
        pinIcon.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'><path fill-rule='evenodd' clip-rule='evenodd' d='M17.1218 1.87023C15.7573 0.505682 13.4779 0.76575 12.4558 2.40261L9.61062 6.95916C9.61033 6.95965 9.60913 6.96167 9.6038 6.96549C9.59728 6.97016 9.58336 6.97822 9.56001 6.9848C9.50899 6.99916 9.44234 6.99805 9.38281 6.97599C8.41173 6.61599 6.74483 6.22052 5.01389 6.87251C4.08132 7.22378 3.61596 8.03222 3.56525 8.85243C3.51687 9.63502 3.83293 10.4395 4.41425 11.0208L7.94975 14.5563L1.26973 21.2363C0.879206 21.6269 0.879206 22.26 1.26973 22.6506C1.66025 23.0411 2.29342 23.0411 2.68394 22.6506L9.36397 15.9705L12.8995 19.5061C13.4808 20.0874 14.2853 20.4035 15.0679 20.3551C15.8881 20.3044 16.6966 19.839 17.0478 18.9065C17.6998 17.1755 17.3043 15.5086 16.9444 14.5375C16.9223 14.478 16.9212 14.4114 16.9355 14.3603C16.9421 14.337 16.9502 14.3231 16.9549 14.3165C16.9587 14.3112 16.9606 14.31 16.9611 14.3098L21.5177 11.4645C23.1546 10.4424 23.4147 8.16307 22.0501 6.79853L17.1218 1.87023ZM14.1523 3.46191C14.493 2.91629 15.2528 2.8296 15.7076 3.28445L20.6359 8.21274C21.0907 8.66759 21.0041 9.42737 20.4584 9.76806L15.9019 12.6133C14.9572 13.2032 14.7469 14.3637 15.0691 15.2327C15.3549 16.0037 15.5829 17.1217 15.1762 18.2015C15.1484 18.2752 15.1175 18.3018 15.0985 18.3149C15.0743 18.3316 15.0266 18.3538 14.9445 18.3589C14.767 18.3699 14.5135 18.2916 14.3137 18.0919L5.82846 9.6066C5.62872 9.40686 5.55046 9.15333 5.56144 8.97583C5.56651 8.8937 5.58877 8.84605 5.60548 8.82181C5.61855 8.80285 5.64516 8.7719 5.71886 8.74414C6.79869 8.33741 7.91661 8.56545 8.68762 8.85128C9.55668 9.17345 10.7171 8.96318 11.3071 8.01845L14.1523 3.46191Z'/></svg>`;
        pinIcon.dataset.tooltip = 'This value has been overridden from its default';
        
        // Show pin icon if field is overridden
        if (overriddenFields.has(path)) {
            pinIcon.classList.add('visible');
        }

        wrapper.appendChild(input);
        wrapper.appendChild(pinIcon);
        
        return wrapper;
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
    content.className = 'array-item-content' + (isUpdatingArrays ? ' collapsed' : ''); // Only collapse if updating from YAML
    
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
        const nameInput = item.querySelector('input[data-path$=".name"]');
        title.textContent = nameInput && nameInput.value ? nameInput.value : `${itemType} ${index + 1}`;
    });
}

function formatLabel(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

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
        
        // Get the key input value
        const keyInput = item.querySelector('input[data-path$="[key]"]');
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
    warningIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.8984 3.61441C12.5328 2.86669 11.4672 2.86669 11.1016 3.61441L3.30562 19.5608C2.98083 20.2251 3.46451 21 4.204 21H19.796C20.5355 21 21.0192 20.2251 20.6944 19.5608L12.8984 3.61441ZM9.30485 2.73599C10.4015 0.492834 13.5985 0.492825 14.6952 2.73599L22.4912 18.6824C23.4655 20.6754 22.0145 23 19.796 23H4.204C1.98555 23 0.534479 20.6754 1.50885 18.6824L9.30485 2.73599Z M11 8.49999C11 7.94771 11.4477 7.49999 12 7.49999C12.5523 7.49999 13 7.94771 13 8.49999V14C13 14.5523 12.5523 15 12 15C11.4477 15 11 14.5523 11 14V8.49999Z M13.5 18C13.5 18.8284 12.8285 19.5 12 19.5C11.1716 19.5 10.5 18.8284 10.5 18C10.5 17.1716 11.1716 16.5 12 16.5C12.8285 16.5 13.5 17.1716 13.5 18Z"/></svg>`;
    warningIcon.dataset.tooltip = 'Numerical keys will be automatically sorted and cannot be reordered';
    warningIcon.style.display = 'none';

    // Create error icon for duplicate keys
    const errorIcon = document.createElement('span');
    errorIcon.className = 'error-icon';
    errorIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 12C6 12.5523 6.44772 13 7 13L17 13C17.5523 13 18 12.5523 18 12C18 11.4477 17.5523 11 17 11H7C6.44772 11 6 11.4477 6 12Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12 23C18.0751 23 23 18.0751 23 12C23 5.92487 18.0751 1 12 1C5.92487 1 1 5.92487 1 12C1 18.0751 5.92487 23 12 23ZM12 20.9932C7.03321 20.9932 3.00683 16.9668 3.00683 12C3.00683 7.03321 7.03321 3.00683 12 3.00683C16.9668 3.00683 20.9932 7.03321 20.9932 12C20.9932 16.9668 16.9668 20.9932 12 20.9932Z"/></svg>`;
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
            // Hide both icons if input is empty
            warningIcon.style.display = 'none';
            errorIcon.style.display = 'none';
            keyInput.classList.remove('error');
            isDuplicateState = false;
        }
        
        updateYamlFromForm();
    });
    
    keyInput.addEventListener('blur', () => {
        const value = keyInput.value;
        if (!value) return;  // Don't check empty values
        
        const isDuplicate = checkDuplicateKey(value);
        
        // Handle duplicate keys
        if (isDuplicate) {
            isDuplicateState = true;
            errorIcon.style.display = 'block';
            warningIcon.style.display = 'none';
            keyInput.value = ''; // Clear the duplicate value
            keyInput.classList.add('error');
            keyInput.focus();
        } else {
            // Only sort if there's no duplicate
            sortObjectItems(container, itemDiv);
            updateObjectItemControls(container);
        }
        
        updateYamlFromForm();
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

    // Extract the actual input element if it's wrapped
    const actualInput = valueInput.tagName.toLowerCase() === 'input' ? valueInput : valueInput.querySelector('input');

    // Create value wrapper div
    const valueWrapper = document.createElement('div');
    valueWrapper.className = 'value-input-wrapper';

    // Create warning icon for empty value
    const emptyValueWarningIcon = document.createElement('span');
    emptyValueWarningIcon.className = 'warning-icon empty-value-warning';
    emptyValueWarningIcon.dataset.mode = 'null'; // Track current mode
    emptyValueWarningIcon.innerHTML = `<?xml version="1.0" encoding="utf-8"?><svg width="16px" height="16px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M22 5C22 3.34315 20.6569 2 19 2H5C3.34315 2 2 3.34315 2 5V19C2 20.6569 3.34315 22 5 22H19C20.6569 22 22 20.6569 22 19V5ZM20 5C20 4.44772 19.5523 4 19 4H5C4.44772 4 4 4.44772 4 5V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V5Z" fill="currentColor"/></svg>`;
    emptyValueWarningIcon.dataset.tooltip = '`null` Mode';
    emptyValueWarningIcon.style.display = 'none';
    emptyValueWarningIcon.style.cursor = 'pointer';

    // Add click handler for the warning icon
    emptyValueWarningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentMode = emptyValueWarningIcon.dataset.mode;
        const newMode = currentMode === 'null' ? 'empty' : 'null';
        emptyValueWarningIcon.dataset.mode = newMode;
        
        if (newMode === 'empty') {
            emptyValueWarningIcon.innerHTML = `<?xml version="1.0" encoding="utf-8"?><svg width="16px" height="16px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 4C2 2.89543 2.89543 2 4 2H20C21.1046 2 22 2.89543 22 4V7C22 7.55229 21.5523 8 21 8C20.4477 8 20 7.55229 20 7V5C20 4.44772 19.5523 4 19 4H13V20H17C17.5523 20 18 20.4477 18 21C18 21.5523 17.5523 22 17 22H7C6.44772 22 6 21.5523 6 21C6 20.4477 6.44772 20 7 20H11V4H5C4.44772 4 4 4.44772 4 5V7C4 7.55229 3.55228 8 3 8C2.44772 8 2 7.55229 2 7V4Z" fill="currentColor"/></svg>`;
            emptyValueWarningIcon.dataset.tooltip = 'Empty String Mode';
        } else {
            emptyValueWarningIcon.innerHTML = `<?xml version="1.0" encoding="utf-8"?><svg width="16px" height="16px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M22 5C22 3.34315 20.6569 2 19 2H5C3.34315 2 2 3.34315 2 5V19C2 20.6569 3.34315 22 5 22H19C20.6569 22 22 20.6569 22 19V5ZM20 5C20 4.44772 19.5523 4 19 4H5C4.44772 4 4 4.44772 4 5V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V5Z" fill="currentColor"/></svg>`;
            emptyValueWarningIcon.dataset.tooltip = '`null` Mode';
        }
        updateYamlFromForm();
    });

    // Add input handler for value field
    const updateWarningVisibility = () => {
        const value = actualInput.value || '';
        const isEmpty = !value.trim();
        emptyValueWarningIcon.style.display = isEmpty ? 'block' : 'none';
        actualInput.classList.toggle('warning', isEmpty);
    };

    actualInput.addEventListener('input', () => {
        updateWarningVisibility();
        updateYamlFromForm();
    });

    // Initial visibility check
    updateWarningVisibility();

    // Append elements to wrapper
    if (valueInput.tagName.toLowerCase() === 'div') {
        // If valueInput is already a wrapper (from createInput), move its contents
        while (valueInput.firstChild) {
            valueWrapper.appendChild(valueInput.firstChild);
        }
    } else {
        valueWrapper.appendChild(valueInput);
    }
    valueWrapper.appendChild(emptyValueWarningIcon);
    itemDiv.appendChild(valueWrapper);  // Add this line back
    
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
    
    // Update styles to include warning icon and input styles
    if (!document.getElementById('warning-icon-styles')) {
        const styles = document.createElement('style');
        styles.id = 'warning-icon-styles';
        styles.textContent = `
            .key-input-wrapper, .value-input-wrapper {
                position: relative;
                display: inline-flex;
                align-items: center;
                width: 100%;
            }
            .key-input, .value-input-wrapper input {
                width: 100%;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .key-input.error {
                border-color: var(--danger-color);
                background-color: #fff8f8;
            }
            .key-input.error:focus {
                border-color: var(--danger-color);
                box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
            }
            .value-input-wrapper input.warning {
                border-color: var(--input-border);
            }
            .value-input-wrapper input.warning:focus {
                border-color: var(--input-focus-border);
                box-shadow: 0 0 0 3px var(--input-focus-shadow);
            }
            .key-input-wrapper:has(.warning-icon[style*="display: block"]) .key-input {
                border-color: var(--warning-color);
            }
            .key-input-wrapper:has(.warning-icon[style*="display: block"]) .key-input:focus {
                border-color: var(--warning-color);
                box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
            }
            .key-input-wrapper:has(.error-icon[style*="display: block"]) .key-input {
                border-color: var(--danger-color);
            }
            .key-input-wrapper:has(.error-icon[style*="display: block"]) .key-input:focus {
                border-color: var(--danger-color);
                box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
            }
            .warning-icon, .error-icon {
                position: absolute;
                right: 8px;
                cursor: help;
                width: 16px;
                height: 16px;
                display: none;
            }
            .warning-icon svg, .error-icon svg {
                width: 100%;
                height: 100%;
            }
            .warning-icon {
                color: var(--warning-color);
            }
            .warning-icon.empty-value-warning {
                color: var(--input-border);
            }
            .error-icon {
                color: var(--danger-color);
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

function toggleOverride(path, label) {
    const pinIcon = document.querySelector(`[data-path="${path}"]`).parentElement.querySelector('.pin-icon');
    
    if (overriddenFields.has(path)) {
        overriddenFields.delete(path);
        label.classList.remove('overridden');
        pinIcon.classList.remove('visible');
    } else {
        overriddenFields.add(path);
        label.classList.add('overridden');
        pinIcon.classList.add('visible');
    }
    
    if (!isUpdatingForm) {
        updateYamlFromForm();
    }
} 