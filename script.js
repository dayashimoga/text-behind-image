/* text-behind-image — Complete Rewrite */
'use strict';
(function(){
    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);
    if(typeof QU !== 'undefined') QU.init({ kofi: true, discover: true });

    const canvas = $('#effectCanvas');
    const ctx = canvas.getContext('2d');
    let img = null;
    let maskCanvas, maskCtx;
    let textX = 0.5, textY = 0.5; // Normalized position
    let isDragging = false;
    let isPainting = false;
    let brushSize = 30;
    let undoStack = [];

    // Initialize mask canvas
    function initMask(w, h) {
        maskCanvas = document.createElement('canvas');
        maskCanvas.width = w;
        maskCanvas.height = h;
        maskCtx = maskCanvas.getContext('2d');
        maskCtx.clearRect(0, 0, w, h);
        undoStack = [];
    }

    // Upload image
    $('#uploadImg').addEventListener('click', () => $('#imgUpload').click());
    $('#imgUpload').addEventListener('change', e => {
        if(e.target.files[0]) {
            const i = new Image();
            i.onload = () => {
                img = i;
                canvas.width = Math.min(800, i.width);
                canvas.height = Math.round(canvas.width * (i.height / i.width));
                initMask(canvas.width, canvas.height);
                render();
            };
            i.src = URL.createObjectURL(e.target.files[0]);
        }
    });

    // Auto-detect foreground via brightness threshold
    if($('#autoDetect')) $('#autoDetect').addEventListener('click', () => {
        if(!img) return;
        const w = canvas.width, h = canvas.height;
        // Draw image temporarily to read pixels
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w; tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0, w, h);
        const imageData = tempCtx.getImageData(0, 0, w, h);
        const data = imageData.data;
        
        initMask(w, h);
        const maskData = maskCtx.createImageData(w, h);
        
        const threshold = parseInt($('#threshold')?.value || 128);
        
        // Edge detection + brightness segmentation
        for(let y = 1; y < h - 1; y++) {
            for(let x = 1; x < w - 1; x++) {
                const idx = (y * w + x) * 4;
                const lum = data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;
                
                // Sobel edge detection
                const getL = (px, py) => {
                    const i = (py * w + px) * 4;
                    return data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
                };
                const gx = -getL(x-1,y-1) - 2*getL(x-1,y) - getL(x-1,y+1) + getL(x+1,y-1) + 2*getL(x+1,y) + getL(x+1,y+1);
                const gy = -getL(x-1,y-1) - 2*getL(x,y-1) - getL(x+1,y-1) + getL(x-1,y+1) + 2*getL(x,y+1) + getL(x+1,y+1);
                const edgeMag = Math.sqrt(gx*gx + gy*gy);
                
                // Mark as foreground if: bright subject on dark bg, or has strong edges
                const isForeground = lum > threshold || edgeMag > 80;
                
                if(isForeground) {
                    maskData.data[idx] = 255;
                    maskData.data[idx+1] = 255;
                    maskData.data[idx+2] = 255;
                    maskData.data[idx+3] = 255;
                }
            }
        }
        
        maskCtx.putImageData(maskData, 0, 0);
        
        // Dilate mask slightly for cleaner edges
        const dilateCanvas = document.createElement('canvas');
        dilateCanvas.width = w; dilateCanvas.height = h;
        const dilateCtx = dilateCanvas.getContext('2d');
        dilateCtx.filter = 'blur(3px)';
        dilateCtx.drawImage(maskCanvas, 0, 0);
        maskCtx.clearRect(0, 0, w, h);
        maskCtx.drawImage(dilateCanvas, 0, 0);
        
        // Threshold the blurred mask
        const blurData = maskCtx.getImageData(0, 0, w, h);
        for(let i = 0; i < blurData.data.length; i += 4) {
            blurData.data[i+3] = blurData.data[i] > 60 ? 255 : 0;
        }
        maskCtx.putImageData(blurData, 0, 0);
        
        render();
        const status = $('#maskStatus');
        if(status) status.textContent = '✅ Auto-mask applied. Refine with brush if needed.';
    });

    // Manual brush tool
    canvas.addEventListener('mousedown', e => {
        const mode = $('input[name="toolMode"]:checked')?.value || 'drag';
        if(mode === 'paint' || mode === 'erase') {
            isPainting = true;
            saveMaskUndo();
            paintMask(e, mode === 'erase');
        } else if(mode === 'drag') {
            isDragging = true;
        }
    });

    canvas.addEventListener('mousemove', e => {
        if(isPainting) {
            const mode = $('input[name="toolMode"]:checked')?.value;
            paintMask(e, mode === 'erase');
        }
        if(isDragging) {
            const rect = canvas.getBoundingClientRect();
            textX = (e.clientX - rect.left) / rect.width;
            textY = (e.clientY - rect.top) / rect.height;
            render();
        }
    });

    canvas.addEventListener('mouseup', () => {
        isPainting = false;
        isDragging = false;
        render();
    });
    canvas.addEventListener('mouseleave', () => {
        isPainting = false;
        isDragging = false;
    });

    function paintMask(e, isErase) {
        if(!maskCtx) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        maskCtx.beginPath();
        maskCtx.arc(x, y, brushSize, 0, Math.PI * 2);
        if(isErase) {
            maskCtx.globalCompositeOperation = 'destination-out';
            maskCtx.fillStyle = 'white';
        } else {
            maskCtx.globalCompositeOperation = 'source-over';
            maskCtx.fillStyle = 'white';
        }
        maskCtx.fill();
        maskCtx.globalCompositeOperation = 'source-over';
        render();
    }

    function saveMaskUndo() {
        if(!maskCanvas) return;
        const snapshot = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        undoStack.push(snapshot);
        if(undoStack.length > 20) undoStack.shift();
    }

    if($('#undoMask')) $('#undoMask').addEventListener('click', () => {
        if(undoStack.length > 0 && maskCtx) {
            maskCtx.putImageData(undoStack.pop(), 0, 0);
            render();
        }
    });

    if($('#clearMask')) $('#clearMask').addEventListener('click', () => {
        if(maskCtx) {
            saveMaskUndo();
            maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            render();
        }
    });

    // Brush size
    if($('#brushSize')) $('#brushSize').addEventListener('input', e => {
        brushSize = parseInt(e.target.value);
        if($('#brushSizeVal')) $('#brushSizeVal').textContent = brushSize + 'px';
    });

    // Threshold
    if($('#threshold')) $('#threshold').addEventListener('input', e => {
        if($('#thresholdVal')) $('#thresholdVal').textContent = e.target.value;
    });

    // Render the 3-layer compositing
    function render() {
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);
        
        if(!img) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '18px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Upload an image to start', w/2, h/2);
            return;
        }
        
        // Layer 1: Draw background image
        ctx.drawImage(img, 0, 0, w, h);
        
        // Layer 2: Draw text
        const txt = $('#behindText')?.value || 'HELLO';
        const fs = parseInt($('#textSize')?.value || 80);
        const fontFamily = $('#fontFamily')?.value || 'Impact';
        const tx = w * textX;
        const ty = h * textY;
        
        ctx.save();
        const rotation = parseInt($('#textRotation')?.value || 0) * Math.PI / 180;
        ctx.translate(tx, ty);
        ctx.rotate(rotation);
        
        ctx.font = `bold ${fs}px ${fontFamily}, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const effect = $('#textEffect')?.value || 'solid';
        
        // Text shadow / glow
        if(effect === 'glow' || effect === 'shadow') {
            ctx.shadowColor = effect === 'glow' ? ($('#textColor')?.value || '#ffffff') : 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = effect === 'glow' ? 20 : 8;
            ctx.shadowOffsetX = effect === 'shadow' ? 4 : 0;
            ctx.shadowOffsetY = effect === 'shadow' ? 4 : 0;
        }
        
        if(effect === 'gradient') {
            const grad = ctx.createLinearGradient(-fs * txt.length * 0.3, 0, fs * txt.length * 0.3, 0);
            grad.addColorStop(0, '#ff6b6b');
            grad.addColorStop(0.5, '#feca57');
            grad.addColorStop(1, '#48dbfb');
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = $('#textColor')?.value || '#ffffff';
        }
        
        ctx.fillText(txt, 0, 0);
        
        // Outline
        if(effect === 'outline') {
            ctx.strokeStyle = $('#textColor')?.value || '#ffffff';
            ctx.lineWidth = 3;
            ctx.strokeText(txt, 0, 0);
            ctx.fillStyle = 'transparent';
        }
        
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.restore();
        
        // Layer 3: Re-draw foreground (masked region) on top
        if(maskCanvas) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = w; tempCanvas.height = h;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Draw the original image
            tempCtx.drawImage(img, 0, 0, w, h);
            
            // Use mask as clip: only keep pixels where mask is white
            tempCtx.globalCompositeOperation = 'destination-in';
            tempCtx.drawImage(maskCanvas, 0, 0);
            
            // Composite the masked foreground on top of everything
            const opacity = parseFloat($('#maskOpacity')?.value || 1);
            ctx.globalAlpha = opacity;
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.globalAlpha = 1;
        }
        
        // Show mask overlay if in paint/erase mode
        const mode = $('input[name="toolMode"]:checked')?.value;
        if((mode === 'paint' || mode === 'erase') && maskCanvas) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#00ff88';
            const maskData = maskCtx.getImageData(0, 0, w, h);
            const overlayCanvas = document.createElement('canvas');
            overlayCanvas.width = w; overlayCanvas.height = h;
            const overlayCtx = overlayCanvas.getContext('2d');
            const overlayData = overlayCtx.createImageData(w, h);
            for(let i = 0; i < maskData.data.length; i += 4) {
                if(maskData.data[i+3] > 0) {
                    overlayData.data[i] = 0;
                    overlayData.data[i+1] = 255;
                    overlayData.data[i+2] = 136;
                    overlayData.data[i+3] = 100;
                }
            }
            overlayCtx.putImageData(overlayData, 0, 0);
            ctx.drawImage(overlayCanvas, 0, 0);
            ctx.globalAlpha = 1;
        }
    }

    // Bind all control inputs to re-render
    ['#behindText','#textColor','#textSize','#fontFamily','#textEffect','#textRotation','#maskOpacity'].forEach(s => {
        const el = $(s);
        if(el) el.addEventListener('input', render);
    });

    // Tool mode radio buttons
    $$('input[name="toolMode"]').forEach(r => r.addEventListener('change', () => {
        canvas.style.cursor = r.value === 'drag' ? 'move' : 'crosshair';
        render();
    }));

    // Export
    if($('#savePNG')) $('#savePNG').addEventListener('click', () => {
        const a = document.createElement('a');
        a.download = 'text-behind.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
    });
    
    if($('#saveJPG')) $('#saveJPG').addEventListener('click', () => {
        const quality = parseInt($('#jpgQuality')?.value || 90) / 100;
        const a = document.createElement('a');
        a.download = 'text-behind.jpg';
        a.href = canvas.toDataURL('image/jpeg', quality);
        a.click();
    });

    render();

})();
