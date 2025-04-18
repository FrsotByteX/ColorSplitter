document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const originalCanvas = document.getElementById('originalPreview');
    const quantizedCanvas = document.getElementById('quantizedPreview');
    const originalCtx = originalCanvas.getContext('2d');
    const quantizedCtx = quantizedCanvas.getContext('2d');
    const imageInput = document.getElementById('imageInput');
    const selectImageBtn = document.getElementById('selectImageBtn');
    const processImageBtn = document.getElementById('processImageBtn');
    const saveOutputBtn = document.getElementById('saveOutputBtn');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const statusToast = new bootstrap.Toast(document.getElementById('statusToast'));
    
    // Settings elements
    const colorsRange = document.getElementById('colorsRange');
    const colorsInput = document.getElementById('colorsInput');
    const iterationsRange = document.getElementById('iterationsRange');
    const iterationsInput = document.getElementById('iterationsInput');
    const resizeCheckbox = document.getElementById('resizeCheckbox');
    const widthInput = document.getElementById('widthInput');
    const heightInput = document.getElementById('heightInput');
    const exportOrderGroup = document.getElementById('exportOrderGroup');
    const themeGroup = document.getElementById('themeGroup');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const loadConfigBtn = document.getElementById('loadConfigBtn');
    
    // App state
    let currentImage = null;
    let quantizedImage = null;
    let colorLayers = [];
    let currentTheme = 'dark';
    
    // Initialize
    initEventListeners();
    loadConfig();
    applyTheme(currentTheme);
    
    function initEventListeners() {
        // Image selection
        selectImageBtn.addEventListener('click', () => imageInput.click());
        imageInput.addEventListener('change', handleImageUpload);
        
        // Processing
        processImageBtn.addEventListener('click', processImage);
        saveOutputBtn.addEventListener('click', saveOutput);
        downloadAllBtn.addEventListener('click', downloadAllLayers);
        
        // Settings synchronization
        colorsRange.addEventListener('input', () => colorsInput.value = colorsRange.value);
        colorsInput.addEventListener('input', () => colorsRange.value = colorsInput.value);
        iterationsRange.addEventListener('input', () => iterationsInput.value = iterationsRange.value);
        iterationsInput.addEventListener('input', () => iterationsRange.value = iterationsInput.value);
        
        // Resize toggle
        resizeCheckbox.addEventListener('change', () => {
            widthInput.disabled = !resizeCheckbox.checked;
            heightInput.disabled = !resizeCheckbox.checked;
        });
        
        // Theme change
        themeGroup.addEventListener('change', (e) => {
            currentTheme = e.target.id === 'darkTheme' ? 'dark' : 'light';
            applyTheme(currentTheme);
        });
        
        // Config buttons
        saveConfigBtn.addEventListener('click', saveConfig);
        loadConfigBtn.addEventListener('click', loadConfig);
        
        // Window resize
        window.addEventListener('resize', () => {
            if (currentImage) {
                showImagePreview(currentImage, originalCanvas);
            }
            if (quantizedImage) {
                showImagePreview(quantizedImage, quantizedCanvas);
            }
        });
    }
    
    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                currentImage = img;
                showImagePreview(img, originalCanvas);
                showStatus(`Loaded: ${file.name}`);
                
                // Reset quantized preview
                quantizedImage = null;
                colorLayers = [];
                document.querySelector('#quantizedPreview + .preview-placeholder').style.display = 'flex';
                quantizedCanvas.style.display = 'none';
                saveOutputBtn.disabled = true;
                downloadAllBtn.disabled = true;
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    function showImagePreview(image, canvas) {
        const container = canvas.parentElement;
        const placeholder = container.querySelector('.preview-placeholder');
        
        // Calculate dimensions to fit container while maintaining aspect ratio
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const aspectRatio = image.width / image.height;
        
        let drawWidth, drawHeight;
        
        if (containerWidth / containerHeight > aspectRatio) {
            drawHeight = containerHeight;
            drawWidth = containerHeight * aspectRatio;
        } else {
            drawWidth = containerWidth;
            drawHeight = containerWidth / aspectRatio;
        }
        
        // Set canvas dimensions
        canvas.width = drawWidth;
        canvas.height = drawHeight;
        
        // Draw image
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, drawWidth, drawHeight);
        
        // Show canvas and hide placeholder
        canvas.style.display = 'block';
        placeholder.style.display = 'none';
    }
    
    async function processImage() {
        if (!currentImage) {
            showStatus('Please select an image first', 'error');
            return;
        }
        
        const numColors = parseInt(colorsInput.value);
        const iterations = parseInt(iterationsInput.value);
        
        try {
            showStatus('Processing image...');
            
            // Create a temporary canvas for processing
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Resize if needed
            let width = currentImage.width;
            let height = currentImage.height;
            
            if (resizeCheckbox.checked) {
                width = parseInt(widthInput.value);
                height = parseInt(heightInput.value);
            }
            
            tempCanvas.width = width;
            tempCanvas.height = height;
            
            // Draw the original image to the temp canvas (with resizing if needed)
            tempCtx.drawImage(currentImage, 0, 0, width, height);
            
            // Get image data
            const imageData = tempCtx.getImageData(0, 0, width, height);
            
            // Quantize colors using k-means clustering
            const quantizedData = await quantizeImage(imageData, numColors, iterations);
            
            // Create a new image from the quantized data
            tempCtx.putImageData(quantizedData, 0, 0);
            
            // Create an Image object from the canvas
            const img = new Image();
            img.onload = function() {
                quantizedImage = img;
                showImagePreview(img, quantizedCanvas);
                
                // Extract color layers
                colorLayers = extractColorLayers(quantizedData);
                
                showStatus(`Processed with ${numColors} colors and ${iterations} iterations`);
                saveOutputBtn.disabled = false;
                downloadAllBtn.disabled = false;
            };
            img.src = tempCanvas.toDataURL();
            
        } catch (error) {
            console.error('Error processing image:', error);
            showStatus('Error processing image', 'error');
        }
    }
    
    function quantizeImage(imageData, numColors, iterations) {
        return new Promise((resolve) => {
            // Convert to fabric.js for quantization
            const fabricCanvas = new fabric.StaticCanvas(null, {
                width: imageData.width,
                height: imageData.height
            });
            
            const fabricImg = new fabric.Image.fromURL(fabricCanvas.toDataURL(), (img) => {
                // Apply quantization
                img.filters.push(
                    new fabric.Image.filters.Quantize({
                        colors: numColors,
                        dither: 0.5
                    })
                );
                img.applyFilters();
                
                fabricCanvas.add(img);
                fabricCanvas.renderAll();
                
                // Get the quantized image data
                const quantizedData = fabricCanvas.getContext().getImageData(
                    0, 0, imageData.width, imageData.height
                );
                
                resolve(quantizedData);
            });
            
            // Set the initial image data
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);
            fabricImg.setElement(tempCanvas);
        });
    }
    
    function extractColorLayers(imageData) {
        const layers = [];
        const colorMap = new Map();
        const { width, height, data } = imageData;
        
        // Collect all unique colors
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            if (a === 0) continue; // Skip transparent pixels
            
            const colorKey = `${r},${g},${b},${a}`;
            
            if (!colorMap.has(colorKey)) {
                colorMap.set(colorKey, { r, g, b, a, count: 0 });
            }
            colorMap.get(colorKey).count++;
        }
        
        // Convert to array and sort by count (descending)
        const colors = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);
        
        // Create a layer for each color
        for (const color of colors) {
            const layerData = new ImageData(width, height);
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];
                
                if (a === 0) continue;
                
                if (r === color.r && g === color.g && b === color.b && a === color.a) {
                    layerData.data[i] = r;
                    layerData.data[i + 1] = g;
                    layerData.data[i + 2] = b;
                    layerData.data[i + 3] = a;
                }
            }
            
            layers.push({
                data: layerData,
                color: { r: color.r, g: color.g, b: color.b, a: color.a },
                count: color.count
            });
        }
        
        return layers;
    }
    
    function saveOutput() {
        if (!colorLayers.length) {
            showStatus('No processed layers to save', 'error');
            return;
        }
        
        // Get the selected export order
        let sortedLayers = [...colorLayers];
        const exportOrder = document.querySelector('input[name="exportOrder"]:checked').id;
        
        if (exportOrder === 'smallToLarge') {
            sortedLayers.sort((a, b) => a.count - b.count);
        } else if (exportOrder === 'randomOrder') {
            sortedLayers = shuffleArray([...colorLayers]);
        }
        
        // Create a zip file with all layers
        const zip = new JSZip();
        const folder = zip.folder('color_layers');
        
        // Add quantized image
        const quantizedCanvas = document.createElement('canvas');
        quantizedCanvas.width = quantizedImage.width;
        quantizedCanvas.height = quantizedImage.height;
        const quantizedCtx = quantizedCanvas.getContext('2d');
        quantizedCtx.drawImage(quantizedImage, 0, 0);
        
        folder.file('quantized.png', quantizedCanvas.toDataURL('image/png').split(',')[1], { base64: true });
        
        // Add color information file
        let colorInfo = '';
        
        // Add each layer
        sortedLayers.forEach((layer, index) => {
            const canvas = document.createElement('canvas');
            canvas.width = layer.data.width;
            canvas.height = layer.data.height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(layer.data, 0, 0);
            
            const hexColor = rgbToHex(layer.color.r, layer.color.g, layer.color.b);
            const fileName = `${hexColor.replace('#', '')}.png`;
            
            folder.file(fileName, canvas.toDataURL('image/png').split(',')[1], { base64: true });
            
            colorInfo += `Layer ${index + 1}: ${hexColor} (${layer.count} pixels)\n`;
        });
        
        folder.file('color_info.txt', colorInfo);
        
        // Generate the zip file
        zip.generateAsync({ type: 'blob' }).then(function(content) {
            saveAs(content, 'color_layers.zip');
            showStatus('All layers saved to color_layers.zip');
        });
    }
    
    async function downloadAllLayers() {
        if (!colorLayers.length) {
            showStatus('No processed layers to save', 'error');
            return;
        }
        
        // Get the selected export order
        let sortedLayers = [...colorLayers];
        const exportOrder = document.querySelector('input[name="exportOrder"]:checked').id;
        
        if (exportOrder === 'smallToLarge') {
            sortedLayers.sort((a, b) => a.count - b.count);
        } else if (exportOrder === 'randomOrder') {
            sortedLayers = shuffleArray([...colorLayers]);
        }
        
        // Download each layer individually
        for (let i = 0; i < sortedLayers.length; i++) {
            const layer = sortedLayers[i];
            const canvas = document.createElement('canvas');
            canvas.width = layer.data.width;
            canvas.height = layer.data.height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(layer.data, 0, 0);
            
            const hexColor = rgbToHex(layer.color.r, layer.color.g, layer.color.b);
            const fileName = `${hexColor.replace('#', '')}.png`;
            
            // Convert canvas to blob and download
            await new Promise(resolve => {
                canvas.toBlob(blob => {
                    saveAs(blob, fileName);
                    resolve();
                }, 'image/png');
            });
            
            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Also download the quantized image
        const quantizedCanvas = document.createElement('canvas');
        quantizedCanvas.width = quantizedImage.width;
        quantizedCanvas.height = quantizedImage.height;
        const quantizedCtx = quantizedCanvas.getContext('2d');
        quantizedCtx.drawImage(quantizedImage, 0, 0);
        
        quantizedCanvas.toBlob(blob => {
            saveAs(blob, 'quantized.png');
            showStatus('All layers downloaded individually');
        }, 'image/png');
    }
    
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }
    
    function shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }
    
    function showStatus(message, type = 'info') {
        const toastBody = document.querySelector('#statusToast .toast-body');
        toastBody.textContent = message;
        
        // Remove previous classes
        toastBody.classList.remove('text-success', 'text-danger', 'text-info');
        
        // Add appropriate class based on type
        if (type === 'success') {
            toastBody.classList.add('text-success');
        } else if (type === 'error') {
            toastBody.classList.add('text-danger');
        } else {
            toastBody.classList.add('text-info');
        }
        
        statusToast.show();
    }
    
    function applyTheme(theme) {
        document.body.className = theme;
        
        // Update theme radio buttons
        if (theme === 'dark') {
            document.getElementById('darkTheme').checked = true;
        } else {
            document.getElementById('lightTheme').checked = true;
        }
    }
    
    function saveConfig() {
        const config = {
            theme: currentTheme,
            quantization: {
                colors: colorsInput.value,
                iterations: iterationsInput.value
            },
            resize: {
                enabled: resizeCheckbox.checked,
                width: widthInput.value,
                height: heightInput.value
            },
            exportOrder: document.querySelector('input[name="exportOrder"]:checked').id
        };
        
        localStorage.setItem('colorSeparatorConfig', JSON.stringify(config));
        showStatus('Configuration saved');
    }
    
    function loadConfig() {
        const savedConfig = localStorage.getItem('colorSeparatorConfig');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                
                // Apply theme
                currentTheme = config.theme || 'dark';
                applyTheme(currentTheme);
                
                // Quantization settings
                colorsInput.value = config.quantization?.colors || 16;
                colorsRange.value = config.quantization?.colors || 16;
                iterationsInput.value = config.quantization?.iterations || 10;
                iterationsRange.value = config.quantization?.iterations || 10;
                
                // Resize settings
                resizeCheckbox.checked = config.resize?.enabled || false;
                widthInput.value = config.resize?.width || 700;
                heightInput.value = config.resize?.height || 700;
                widthInput.disabled = !resizeCheckbox.checked;
                heightInput.disabled = !resizeCheckbox.checked;
                
                // Export order
                const exportOrder = config.exportOrder || 'largeToSmall';
                document.getElementById(exportOrder).checked = true;
                
                showStatus('Configuration loaded');
                return true;
            } catch (e) {
                console.error('Error loading config:', e);
                return false;
            }
        }
        return false;
    }
});
