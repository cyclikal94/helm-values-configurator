// This should be a download button for the resultant YAML file
document.getElementById('download-btn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([editor.getValue()], { type: 'text/yaml' }));
    a.download = 'values.yaml';
    a.click();
});

function initializeEditor() {
    // Initialise CodeMirror 6 YAML editor
}