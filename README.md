# Helm Values Configurator

A simple web-based tool to configure and generate `values.yaml` files for Helm charts based on a JSON schema.

## Features

- Dynamic form generation based on `values.schema.json`
- Support for nested objects, arrays, and various data types
- Real-time validation based on schema constraints
- Download generated `values.yaml` file
- Automatic deployment to GitHub Pages when schema is updated

## Usage

1. Visit the GitHub Pages site for this repository
2. Fill in the form with your desired configuration values
3. Click "Download values.yaml" to get your configuration file
4. Use the downloaded file with your Helm chart installation

## Development

### Local Testing

To test locally, you can use any static file server. For example, with Python:

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

Then visit `http://localhost:8000` in your browser.

### Updating the Schema

1. Modify `values.schema.json` with your updated schema
2. Commit and push to the main branch
3. GitHub Actions will automatically deploy the updated site to GitHub Pages

## How It Works

The site uses vanilla JavaScript to:
1. Load and parse the JSON schema
2. Generate a dynamic form based on the schema structure
3. Convert form values to YAML format
4. Allow downloading the generated YAML file

No build process or external dependencies are required (except for js-yaml for YAML generation).

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request 