class ImageEditor {
    constructor() {
        this.mainCanvas = document.getElementById('mainCanvas');
        this.tempCanvas = document.getElementById('tempCanvas');
        
        console.log('Canvas elements:', {
            main: this.mainCanvas,
            temp: this.tempCanvas
        });
        
        this.ctx = this.mainCanvas.getContext('2d');
        this.tempCtx = this.tempCanvas.getContext('2d');
        
        console.log('Canvas contexts:', {
            mainCtx: this.ctx,
            tempCtx: this.tempCtx
        });
        
        console.log('Initial canvas dimensions:', {
            main: {
                width: this.mainCanvas.width,
                height: this.mainCanvas.height,
                style: {
                    width: this.mainCanvas.style.width,
                    height: this.mainCanvas.style.height
                }
            },
            temp: {
                width: this.tempCanvas.width,
                height: this.tempCanvas.height,
                style: {
                    width: this.tempCanvas.style.width,
                    height: this.tempCanvas.style.height
                }
            }
        });

        this.currentMode = 'basic';
        this.isDrawing = false;
        this.pathPoints = [];
        this.originalImage = null;
        this.currentPath = null;
        this.imageData = null;
        
        this.history = [];
        this.currentHistoryIndex = -1;
        this.maxHistorySteps = 20;
        this.lastActionTimestamp = 0;
        this.debounceDelay = 300;
        this.isAdjusting = false;
        this.initialState = null;
        
        this.isCropping = false;
        this.cropStart = { x: 0, y: 0 };
        this.cropSize = { width: 0, height: 0 };
        this.cropArea = null;
        this.dragHandle = null;
        
        this.currentRotation = 0;
        
        this.setupEventListeners();
        this.setupUndoRedo();
        this.setupCropEvents();
        this.setupRotateFlipEvents();
        this.setupFilterEvents();
    }

    setupEventListeners() {
        // 文件输入处理
        document.getElementById('imageInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            console.log('File selected:', file);

            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    console.log('File loaded');
                    this.originalImage = new Image();
                    this.originalImage.onload = () => {
                        console.log('Image loaded:', this.originalImage.width, this.originalImage.height);
                        this.drawImage();
                    };
                    this.originalImage.onerror = (err) => {
                        console.error('Image load error:', err);
                    };
                    this.originalImage.src = event.target.result;
                };
                reader.onerror = (err) => {
                    console.error('File read error:', err);
                };
                reader.readAsDataURL(file);
            }
        });

        // 模式切换
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // 更新按钮状态
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // 更新模式
                this.currentMode = e.target.dataset.mode;

                // 切换面板显示
                document.querySelectorAll('.mode-panel').forEach(panel => {
                    panel.style.display = 'none';
                });
                if (this.currentMode === 'basic') {
                    document.getElementById('basicEditPanel').style.display = 'block';
                } else if (this.currentMode === 'textpath') {
                    document.getElementById('pathTextPanel').style.display = 'block';
                }
            });
        });

        // 画布事件
        this.mainCanvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.mainCanvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.mainCanvas.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // 保存按钮
        document.getElementById('saveBtn').addEventListener('click', this.saveImage.bind(this));

        // 文字相关控件事件监听
        ['fontSize', 'textColor', 'textSpacing'].forEach(id => {
            const element = document.getElementById(id);
            
            // 添加开始调整事件
            element.addEventListener('mousedown', () => {
                this.isAdjusting = true;
                this.initialState = {
                    imageData: this.ctx.getImageData(0, 0, this.mainCanvas.width, this.mainCanvas.height),
                    pathPoints: this.currentPath ? [...this.currentPath] : null
                };
            });

            // 添加结束调整事件
            element.addEventListener('mouseup', () => {
                if (this.isAdjusting) {
                    this.isAdjusting = false;
                    this.saveToHistory('adjustText');
                }
            });

            // 使用防抖处理实时更新
            const debouncedUpdate = this.debounce(() => {
                if (this.currentPath) {
                    this.redrawPathText(false); // 不保存到历史记录
                }
            }, 16); // 约60fps的更新频率

            element.addEventListener('input', (e) => {
                if (id === 'textSpacing') {
                    document.getElementById('spacingValue').textContent = 
                        `${parseFloat(e.target.value).toFixed(1)}px`;
                }
                debouncedUpdate();
            });
        });

        // 文字内容变化立即保存
        document.getElementById('pathText').addEventListener('input', () => {
            if (this.currentPath) {
                this.redrawPathText(true); // 保存到历史记录
            }
        });

        // 设置默认值
        document.getElementById('pathText').value = '🌟这是路径文字效果✨';
        document.getElementById('textColor').value = '#000000';
        document.getElementById('textSpacing').value = '0';
    }

    handleMouseDown(e) {
        if (this.currentMode !== 'textpath') return;
        
        this.isDrawing = true;
        const rect = this.mainCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.pathPoints = [{x, y}];
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    }

    handleMouseMove(e) {
        if (!this.isDrawing || this.currentMode !== 'textpath') return;

        const rect = this.mainCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.pathPoints.push({x, y});
        this.drawPathPreview();
    }

    handleMouseUp() {
        if (this.currentMode !== 'textpath' || !this.isDrawing) return;
        
        this.isDrawing = false;
        if (this.pathPoints.length >= 2) {
            this.currentPath = [...this.pathPoints];
            this.imageData = this.ctx.getImageData(0, 0, this.mainCanvas.width, this.mainCanvas.height);
            this.drawPathText();
            
            // 保存路径文字操作到历史记录
            this.saveToHistory('addPathText');
        }
    }

    // 新增：绘制路径预览
    drawPathPreview() {
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
        if (this.pathPoints.length < 2) return;

        this.tempCtx.beginPath();
        this.tempCtx.moveTo(this.pathPoints[0].x, this.pathPoints[0].y);
        
        for (let i = 1; i < this.pathPoints.length; i++) {
            this.tempCtx.lineTo(this.pathPoints[i].x, this.pathPoints[i].y);
        }

        this.tempCtx.strokeStyle = '#666';
        this.tempCtx.lineWidth = 1;
        this.tempCtx.stroke();
    }

    // 新增：重新绘制路径文字
    redrawPathText(saveHistory = true) {
        if (!this.currentPath) return;
        
        // 恢复保存的路径
        this.pathPoints = [...this.currentPath];
        
        // 先恢复原始图像
        if (this.imageData) {
            this.ctx.putImageData(this.imageData, 0, 0);
        }
        
        // 清除临时画布
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
        
        // 重新绘制文字
        this.drawPathText();
        
        // 只在需要时保存到历史记录
        if (saveHistory && !this.isAdjusting) {
            this.saveToHistory('updatePathText');
        }
    }

    drawPathText() {
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
        if (this.pathPoints.length < 2) return;

        const text = document.getElementById('pathText').value || '这是路径文字效果';
        const fontSize = parseInt(document.getElementById('fontSize').value) || 20;
        const textColor = document.getElementById('textColor').value || '#000000';
        
        // 使用支持 emoji 的字体
        this.tempCtx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", Arial`;
        this.tempCtx.fillStyle = textColor;
        this.tempCtx.textAlign = 'center';
        
        // 简化路径点，减少冗余点
        const simplifiedPoints = this.simplifyPath(this.pathPoints, 5);
        
        // 将文本转换数组，正确处理 emoji
        const textArray = Array.from(text);
        
        // 计算实际字符宽度（考虑 emoji）
        const charWidths = textArray.map(char => this.tempCtx.measureText(char).width);
        const maxCharWidth = Math.max(...charWidths);
        
        // 使用浮点数计算间距
        const spacing = parseFloat(document.getElementById('textSpacing').value) || 0;
        const charSpacing = maxCharWidth + (maxCharWidth * spacing * 0.1); // 将间距值转换为字符宽度的比例
        
        let currentLength = 0;
        let textPosition = 0;
        
        // 遍历路径段
        for (let i = 0; i < simplifiedPoints.length - 1; i++) {
            const p1 = simplifiedPoints[i];
            const p2 = simplifiedPoints[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            // 在当前段上绘制文字
            while (currentLength < segmentLength) {
                const t = currentLength / segmentLength;
                const x = p1.x + dx * t;
                const y = p1.y + dy * t;
                
                // 获取当前字符（循环使用文本）
                const currentChar = textArray[textPosition % textArray.length];
                
                // 绘制字符
                this.tempCtx.save();
                this.tempCtx.translate(x, y);
                this.tempCtx.rotate(angle);
                this.tempCtx.fillText(currentChar, 0, 0);
                this.tempCtx.restore();
                
                // 移动到下一个字符位置
                textPosition++;
                currentLength += charSpacing;
            }
            
            // 更新剩余距离
            currentLength -= segmentLength;
        }

        // 在应用文字之前恢复原始图像
        if (this.imageData) {
            this.ctx.putImageData(this.imageData, 0, 0);
        }

        this.applyPathText();
    }

    // 添加路径简化方法
    simplifyPath(points, tolerance) {
        if (points.length <= 2) return points;
        
        const simplified = [points[0]];
        let prevPoint = points[0];
        
        for (let i = 1; i < points.length - 1; i++) {
            const point = points[i];
            const nextPoint = points[i + 1];
            
            const d1 = Math.sqrt(
                Math.pow(point.x - prevPoint.x, 2) + 
                Math.pow(point.y - prevPoint.y, 2)
            );
            
            if (d1 > tolerance) {
                simplified.push(point);
                prevPoint = point;
            }
        }
        
        simplified.push(points[points.length - 1]);
        return simplified;
    }

    drawImage() {
        console.log('Drawing image...');
        const canvas = this.mainCanvas;
        const ctx = this.ctx;
        
        console.log('Canvas state before drawing:', {
            width: canvas.width,
            height: canvas.height,
            style: {
                width: canvas.style.width,
                height: canvas.style.height
            },
            position: canvas.getBoundingClientRect()
        });
        
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        console.log('Background filled');
        
        if (this.originalImage) {
            console.log('Original image state:', {
                width: this.originalImage.width,
                height: this.originalImage.height,
                complete: this.originalImage.complete,
                naturalWidth: this.originalImage.naturalWidth,
                naturalHeight: this.originalImage.naturalHeight
            });
            
            const scale = Math.min(
                canvas.width / this.originalImage.width,
                canvas.height / this.originalImage.height
            );
            
            const scaledWidth = this.originalImage.width * scale;
            const scaledHeight = this.originalImage.height * scale;
            const x = (canvas.width - scaledWidth) / 2;
            const y = (canvas.height - scaledHeight) / 2;
            
            try {
                console.log('Canvas pixel data before drawing:', ctx.getImageData(0, 0, 1, 1).data);
                ctx.drawImage(this.originalImage, x, y, scaledWidth, scaledHeight);
                console.log('Canvas pixel data after drawing:', ctx.getImageData(0, 0, 1, 1).data);
                console.log('Image drawn successfully');
            } catch (err) {
                console.error('Draw error:', err);
            }
            
            console.log('Temp canvas dimensions after sync:', {
                width: this.tempCanvas.width,
                height: this.tempCanvas.height
            });
        } else {
            console.log('No image to draw');
        }

        // 在成功绘制后态
        this.saveToHistory('uploadImage');
    }

    applyPathText() {
        this.ctx.drawImage(this.tempCanvas, 0, 0);
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    }

    saveImage() {
        const link = document.createElement('a');
        link.download = 'edited-image.png';
        link.href = this.mainCanvas.toDataURL();
        link.click();
    }

    // 添加撤销/重做按钮设置
    setupUndoRedo() {
        const toolSection = document.querySelector('.tool-section:first-child');
        
        const undoRedoDiv = document.createElement('div');
        undoRedoDiv.className = 'undo-redo-buttons';
        undoRedoDiv.innerHTML = `
            <button id="undoBtn" disabled>撤销</button>
            <button id="redoBtn" disabled>重做</button>
        `;
        
        toolSection.appendChild(undoRedoDiv);

        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
    }

    // 保存操作到历史记录
    saveToHistory(actionName) {
        const currentTime = Date.now();
        
        // 如果是调整结束，使用初始态作为起点
        if (actionName === 'adjustText' && this.initialState) {
            // 删除调整过程中的临时状态
            while (this.currentHistoryIndex > 0 && 
                   this.history[this.currentHistoryIndex].actionName === 'updatePathText') {
                this.history.pop();
                this.currentHistoryIndex--;
            }
            
            // 保存初始状态和最终状态
            this.history.push({
                actionName: 'adjustTextStart',
                ...this.initialState,
                timestamp: currentTime
            });
            this.currentHistoryIndex++;
        }
        
        // 获取当前画布状态
        const currentState = {
            actionName,
            imageData: this.ctx.getImageData(0, 0, this.mainCanvas.width, this.mainCanvas.height),
            pathPoints: this.currentPath ? [...this.currentPath] : null,
            timestamp: currentTime
        };

        // 如当前不在历记录末尾，删除后面的记录
        if (this.currentHistoryIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentHistoryIndex + 1);
        }

        // 添加新的状态
        this.history.push(currentState);
        this.currentHistoryIndex++;

        // 限制历记录长度
        if (this.history.length > this.maxHistorySteps) {
            this.history.shift();
            this.currentHistoryIndex--;
        }

        this.updateUndoRedoButtons();
        this.initialState = null;
    }

    // 撤销
    undo() {
        if (this.currentHistoryIndex > 0) {
            this.currentHistoryIndex--;
            this.restoreState(this.history[this.currentHistoryIndex]);
            this.updateUndoRedoButtons();
        }
    }

    // 重做
    redo() {
        if (this.currentHistoryIndex < this.history.length - 1) {
            this.currentHistoryIndex++;
            this.restoreState(this.history[this.currentHistoryIndex]);
            this.updateUndoRedoButtons();
        }
    }

    // 恢复状态
    restoreState(state) {
        if (!state) return;

        // 恢复画布状态
        this.ctx.putImageData(state.imageData, 0, 0);
        
        // 恢复路径状态
        this.currentPath = state.pathPoints ? [...state.pathPoints] : null;
        
        // 保存当前图像数据用于路径文字操作
        this.imageData = this.ctx.getImageData(0, 0, this.mainCanvas.width, this.mainCanvas.height);
    }

    // 更新撤销/重做按钮状态
    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        undoBtn.disabled = this.currentHistoryIndex <= 0;
        redoBtn.disabled = this.currentHistoryIndex >= this.history.length - 1;
    }

    // 添加防抖函数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    setupCropEvents() {
        document.getElementById('cropBtn').addEventListener('click', () => this.startCrop());
        document.getElementById('applyCropBtn').addEventListener('click', () => this.applyCrop());
        document.getElementById('cancelCropBtn').addEventListener('click', () => this.cancelCrop());
    }

    setupCropAreaEvents() {
        let isDragging = false;
        let startX, startY;
        let startLeft, startTop;
        let startWidth, startHeight;
        let aspectRatio = null;
        
        const onMouseDown = (e) => {
            if (!this.isCropping) return;
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            this.dragHandle = e.target.classList.contains('crop-handle') ? e.target : null;
            
            const canvasRect = this.mainCanvas.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            const rect = this.cropArea.getBoundingClientRect();
            startLeft = rect.left - canvasRect.left;
            startTop = rect.top - canvasRect.top;
            startWidth = rect.width;
            startHeight = rect.height;
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        
        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            if (this.dragHandle) {
                // 调整大小
                const handle = this.dragHandle.className.split(' ')[1];
                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;
                
                switch (handle) {
                    case 'nw':
                        newWidth = startWidth - dx;
                        newHeight = startHeight - dy;
                        newLeft = startLeft + dx;
                        newTop = startTop + dy;
                        break;
                    case 'n':
                        newHeight = startHeight - dy;
                        newTop = startTop + dy;
                        break;
                    case 'ne':
                        newWidth = startWidth + dx;
                        newHeight = startHeight - dy;
                        newTop = startTop + dy;
                        break;
                    case 'e':
                        newWidth = startWidth + dx;
                        break;
                    case 'se':
                        newWidth = startWidth + dx;
                        newHeight = startHeight + dy;
                        break;
                    case 's':
                        newHeight = startHeight + dy;
                        break;
                    case 'sw':
                        newWidth = startWidth - dx;
                        newHeight = startHeight + dy;
                        newLeft = startLeft + dx;
                        break;
                    case 'w':
                        newWidth = startWidth - dx;
                        newLeft = startLeft + dx;
                        break;
                }
                
                this.updateCropArea(
                    newLeft - this.mainCanvas.offsetLeft,
                    newTop - this.mainCanvas.offsetTop,
                    newWidth,
                    newHeight
                );
            } else {
                // 移动整个裁切区域
                this.updateCropArea(
                    startLeft + dx - this.mainCanvas.offsetLeft,
                    startTop + dy - this.mainCanvas.offsetTop,
                    startWidth,
                    startHeight
                );
            }
        };
        
        const onMouseUp = () => {
            isDragging = false;
            this.dragHandle = null;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        // 为裁切区域添加事件监听
        this.cropArea.addEventListener('mousedown', onMouseDown);
        
        // 为每个手柄单独添加事件监听
        this.cropArea.querySelectorAll('.crop-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // 阻止事件冒泡到裁切区域
                onMouseDown(e);
            });
        });
    }

    startCrop() {
        console.log('Starting crop...');
        this.isCropping = true;
        
        // 更新按钮显示状态
        document.getElementById('cropBtn').style.display = 'none';
        document.getElementById('applyCropBtn').style.display = 'inline-block';
        document.getElementById('cancelCropBtn').style.display = 'inline-block';
        
        // 获取画布容器的位置和大小
        const canvasContainer = this.mainCanvas.parentElement;
        const containerRect = canvasContainer.getBoundingClientRect();
        console.log('Container rect:', containerRect);
        
        // 创建裁切覆盖层
        const overlay = document.createElement('div');
        overlay.className = 'crop-overlay';
        
        // 创建四个遮罩区域
        ['top', 'right', 'bottom', 'left'].forEach(position => {
            const mask = document.createElement('div');
            mask.className = `crop-mask-${position}`;
            overlay.appendChild(mask);
        });
        
        // 创建裁切区域
        const cropArea = document.createElement('div');
        cropArea.className = 'crop-area';
        
        // 添加八个控制点
        ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `crop-handle ${pos}`;
            cropArea.appendChild(handle);
        });
        
        this.cropArea = cropArea;
        overlay.appendChild(cropArea);
        
        // 将覆盖层添加到画布容器中
        overlay.style.width = `${canvasContainer.offsetWidth}px`;
        overlay.style.height = `${canvasContainer.offsetHeight}px`;
        canvasContainer.appendChild(overlay);

        // 计算图片在画布中的实际位置和大小
        const scale = Math.min(
            this.mainCanvas.width / this.originalImage.width,
            this.mainCanvas.height / this.originalImage.height
        );
        
        const scaledWidth = Math.floor(this.originalImage.width * scale);
        const scaledHeight = Math.floor(this.originalImage.height * scale);
        const x = Math.floor((this.mainCanvas.width - scaledWidth) / 2);
        const y = Math.floor((this.mainCanvas.height - scaledHeight) / 2);
        
        console.log('Image calculations:', {
            scale,
            scaledWidth,
            scaledHeight,
            x,
            y
        });
        
        // 转换为屏幕坐标（相对于容器）
        const displayScale = containerRect.width / this.mainCanvas.width;
        const imageDisplayX = Math.floor(x * displayScale);
        const imageDisplayY = Math.floor(y * displayScale);
        const imageDisplayWidth = Math.floor(scaledWidth * displayScale);
        const imageDisplayHeight = Math.floor(scaledHeight * displayScale);
        
        console.log('Screen coordinates:', {
            displayScale,
            imageDisplayX,
            imageDisplayY,
            imageDisplayWidth,
            imageDisplayHeight
        });
        
        // 设置初始裁切区域大小（基于图片实际显示大小）
        const initialSize = Math.floor(Math.min(imageDisplayWidth, imageDisplayHeight) * 0.8);
        
        // 计算初始裁切区域位置（居中）
        const cropX = Math.floor(imageDisplayX + (imageDisplayWidth - initialSize) / 2);
        const cropY = Math.floor(imageDisplayY + (imageDisplayHeight - initialSize) / 2);
        
        // 更新裁切区域
        this.updateCropArea(cropX, cropY, initialSize, initialSize);
        
        // 添加事件监听
        this.setupCropAreaEvents();
    }

    updateCropArea(x, y, width, height) {
        console.log('Updating crop area:', { x, y, width, height });
        const containerRect = this.mainCanvas.parentElement.getBoundingClientRect();
        
        // 计算图片在画布中的实际位置和大小
        const scale = Math.min(
            this.mainCanvas.width / this.originalImage.width,
            this.mainCanvas.height / this.originalImage.height
        );
        
        const scaledWidth = Math.floor(this.originalImage.width * scale);
        const scaledHeight = Math.floor(this.originalImage.height * scale);
        const imageX = Math.floor((this.mainCanvas.width - scaledWidth) / 2);
        const imageY = Math.floor((this.mainCanvas.height - scaledHeight) / 2);
        
        // 转换为屏幕坐标（相对于容器）
        const displayScale = containerRect.width / this.mainCanvas.width;
        
        // 使用 floor 确保精确对齐，不再添加容器偏移
        const imageDisplayX = Math.floor(imageX * displayScale);
        const imageDisplayY = Math.floor(imageY * displayScale);
        const imageDisplayWidth = Math.floor(scaledWidth * displayScale);
        const imageDisplayHeight = Math.floor(scaledHeight * displayScale);
        
        console.log('Display coordinates:', {
            imageDisplayX,
            imageDisplayY,
            imageDisplayWidth,
            imageDisplayHeight
        });
        
        // 限制裁切框在图片范围内
        const newX = Math.floor(Math.max(imageDisplayX, Math.min(x, imageDisplayX + imageDisplayWidth - width)));
        const newY = Math.floor(Math.max(imageDisplayY, Math.min(y, imageDisplayY + imageDisplayHeight - height)));
        
        // 限制最小尺寸和最大尺寸
        const minSize = 50;
        const maxWidth = imageDisplayWidth;
        const maxHeight = imageDisplayHeight;
        
        // 确保宽高不超过图片范围
        const newWidth = Math.floor(Math.max(minSize, Math.min(width, maxWidth, imageDisplayX + imageDisplayWidth - newX)));
        const newHeight = Math.floor(Math.max(minSize, Math.min(height, maxHeight, imageDisplayY + imageDisplayHeight - newY)));
        
        console.log('New crop area:', {
            newX,
            newY,
            newWidth,
            newHeight,
            imageDisplayX,
            imageDisplayY,
            imageDisplayWidth,
            imageDisplayHeight
        });
        
        // 更新裁切区域位置和大小
        this.cropArea.style.left = `${newX}px`;
        this.cropArea.style.top = `${newY}px`;
        this.cropArea.style.width = `${newWidth}px`;
        this.cropArea.style.height = `${newHeight}px`;
        
        // 计算遮罩区域尺寸，确保完全覆盖图片区域
        const maskTop = overlay.querySelector('.crop-mask-top');
        const maskRight = overlay.querySelector('.crop-mask-right');
        const maskBottom = overlay.querySelector('.crop-mask-bottom');
        const maskLeft = overlay.querySelector('.crop-mask-left');
        
        // 上方遮罩
        maskTop.style.left = `${imageDisplayX}px`;
        maskTop.style.top = `${imageDisplayY}px`;
        maskTop.style.width = `${imageDisplayWidth}px`;
        maskTop.style.height = `${newY - imageDisplayY}px`;
        
        // 右侧遮罩 - 确保宽度不会超出图片区域
        const rightMaskWidth = Math.max(0, imageDisplayWidth - (newX - imageDisplayX + newWidth));
        maskRight.style.left = `${newX + newWidth}px`;
        maskRight.style.top = `${newY}px`;
        maskRight.style.width = `${rightMaskWidth}px`;
        maskRight.style.height = `${newHeight}px`;
        
        // 底部遮罩 - 确保高度不会超出图片区域
        const bottomMaskHeight = Math.max(0, imageDisplayHeight - (newY - imageDisplayY + newHeight));
        maskBottom.style.left = `${imageDisplayX}px`;
        maskBottom.style.top = `${newY + newHeight}px`;
        maskBottom.style.width = `${imageDisplayWidth}px`;
        maskBottom.style.height = `${bottomMaskHeight}px`;
        
        // 左侧遮罩
        maskLeft.style.left = `${imageDisplayX}px`;
        maskLeft.style.top = `${newY}px`;
        maskLeft.style.width = `${newX - imageDisplayX}px`;
        maskLeft.style.height = `${newHeight}px`;
        
        // 添加调试日志
        console.log('Mask dimensions:', {
            right: {
                width: rightMaskWidth,
                x: newX + newWidth
            },
            bottom: {
                height: bottomMaskHeight,
                y: newY + newHeight
            },
            imageRight: imageDisplayX + imageDisplayWidth,
            imageBottom: imageDisplayY + imageDisplayHeight
        });
        
        // 保存实际的裁切坐标和尺寸
        this.cropStart = {
            x: Math.floor(newX / displayScale),
            y: Math.floor(newY / displayScale)
        };
        
        this.cropSize = {
            width: Math.floor(newWidth / displayScale),
            height: Math.floor(newHeight / displayScale)
        };
    }

    applyCrop() {
        if (!this.isCropping) return;
        
        // 创建临时画布进行裁切
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // 设置临时画布大小为裁切区域大小
        tempCanvas.width = this.cropSize.width;
        tempCanvas.height = this.cropSize.height;
        
        // 将裁切区域的内容绘制到临时画布
        tempCtx.drawImage(
            this.mainCanvas,
            this.cropStart.x,
            this.cropStart.y,
            this.cropSize.width,
            this.cropSize.height,
            0,
            0,
            this.cropSize.width,
            this.cropSize.height
        );
        
        // 调整主画布大小并绘制裁切后的图像
        this.mainCanvas.width = this.cropSize.width;
        this.mainCanvas.height = this.cropSize.height;
        this.tempCanvas.width = this.cropSize.width;
        this.tempCanvas.height = this.cropSize.height;
        
        this.ctx.drawImage(tempCanvas, 0, 0);
        
        // 保存到历史记录
        this.saveToHistory('crop');
        
        // 清理裁切相关元素
        this.endCrop();
    }

    cancelCrop() {
        this.endCrop();
    }

    endCrop() {
        this.isCropping = false;
        const overlay = this.cropArea.parentElement;
        if (overlay) {
            overlay.remove();
        }
        this.cropArea = null;
        
        // 恢复按钮状态
        document.getElementById('cropBtn').style.display = 'block';
        document.getElementById('applyCropBtn').style.display = 'none';
        document.getElementById('cancelCropBtn').style.display = 'none';
    }

    setupRotateFlipEvents() {
        document.getElementById('rotateLeftBtn').addEventListener('click', () => this.rotate(-90));
        document.getElementById('rotateRightBtn').addEventListener('click', () => this.rotate(90));
        document.getElementById('flipHBtn').addEventListener('click', () => this.flip('horizontal'));
        document.getElementById('flipVBtn').addEventListener('click', () => this.flip('vertical'));
    }

    rotate(angle) {
        console.log('Rotating image:', angle);
        
        // 创建临时画布
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // 设置临时画布大小为原画布大小
        tempCanvas.width = this.mainCanvas.width;
        tempCanvas.height = this.mainCanvas.height;
        
        // 将当前画布内容复制到临时画布
        tempCtx.drawImage(this.mainCanvas, 0, 0);
        
        // 清除主画布
        this.ctx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        
        // 移动到画布中心并旋转
        this.ctx.save();
        this.ctx.translate(this.mainCanvas.width / 2, this.mainCanvas.height / 2);
        this.ctx.rotate(angle * Math.PI / 180);
        this.ctx.translate(-this.mainCanvas.width / 2, -this.mainCanvas.height / 2);
        
        // 绘制旋转后的图像
        this.ctx.drawImage(tempCanvas, 0, 0);
        this.ctx.restore();
        
        // 保存到历史记录
        this.saveToHistory('rotate');
    }

    flip(direction) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = this.mainCanvas.width;
        tempCanvas.height = this.mainCanvas.height;
        
        tempCtx.save();
        if (direction === 'horizontal') {
            tempCtx.scale(-1, 1);
            tempCtx.drawImage(this.mainCanvas, -tempCanvas.width, 0);
        } else {
            tempCtx.scale(1, -1);
            tempCtx.drawImage(this.mainCanvas, 0, -tempCanvas.height);
        }
        tempCtx.restore();
        
        this.ctx.drawImage(tempCanvas, 0, 0);
        this.saveToHistory('flip');
    }

    setupFilterEvents() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                this.applyFilter(filter);
            });
        });
    }

    applyFilter(filterType) {
        // 保存当前画布状态
        const currentCanvas = document.createElement('canvas');
        const currentCtx = currentCanvas.getContext('2d');
        currentCanvas.width = this.mainCanvas.width;
        currentCanvas.height = this.mainCanvas.height;
        currentCtx.drawImage(this.mainCanvas, 0, 0);
        
        // 获取图片实际区域
        const imageRect = this.getImageRect();
        
        // 只获取图片区域的像素数据
        const imageData = this.ctx.getImageData(
            imageRect.x,
            imageRect.y,
            imageRect.width,
            imageRect.height
        );
        const pixels = imageData.data;
        
        // 应用滤镜效果
        switch (filterType) {
            case 'grayscale':
                for (let i = 0; i < pixels.length; i += 4) {
                    const avg = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                    pixels[i] = pixels[i + 1] = pixels[i + 2] = avg;
                }
                break;
                
            case 'sepia':
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    pixels[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
                    pixels[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
                    pixels[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
                }
                break;
                
            case 'warm':
                for (let i = 0; i < pixels.length; i += 4) {
                    pixels[i] = Math.min(255, pixels[i] * 1.1); // 增加红色
                    pixels[i + 2] = Math.max(0, pixels[i + 2] * 0.9); // 减少蓝色
                }
                break;
                
            case 'cool':
                for (let i = 0; i < pixels.length; i += 4) {
                    pixels[i] = Math.max(0, pixels[i] * 0.9); // 减少红色
                    pixels[i + 2] = Math.min(255, pixels[i + 2] * 1.1); // 增加蓝色
                }
                break;
                
            case 'vintage':
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    pixels[i] = r * 0.9 + g * 0.1;
                    pixels[i + 1] = g * 0.8 + b * 0.2;
                    pixels[i + 2] = b * 0.7 + r * 0.3;
                }
                break;
                
            case 'fade':
                for (let i = 0; i < pixels.length; i += 4) {
                    pixels[i] = Math.min(255, pixels[i] * 1.2);
                    pixels[i + 1] = Math.min(255, pixels[i + 1] * 1.2);
                    pixels[i + 2] = Math.min(255, pixels[i + 2] * 1.2);
                    pixels[i + 3] = pixels[i + 3] * 0.8; // 降低不透明度
                }
                break;
                
            case 'dramatic':
                for (let i = 0; i < pixels.length; i += 4) {
                    pixels[i] = Math.min(255, pixels[i] * 1.5);
                    pixels[i + 1] = pixels[i + 1] * 0.8;
                    pixels[i + 2] = pixels[i + 2] * 0.8;
                }
                break;
                
            case 'bright':
                for (let i = 0; i < pixels.length; i += 4) {
                    pixels[i] = Math.min(255, pixels[i] * 1.2);
                    pixels[i + 1] = Math.min(255, pixels[i + 1] * 1.2);
                    pixels[i + 2] = Math.min(255, pixels[i + 2] * 1.2);
                }
                break;
                
            case 'dark':
                for (let i = 0; i < pixels.length; i += 4) {
                    pixels[i] = pixels[i] * 0.8;
                    pixels[i + 1] = pixels[i + 1] * 0.8;
                    pixels[i + 2] = pixels[i + 2] * 0.8;
                }
                break;
        }
        
        // 只更新图片区域
        this.ctx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        
        // 先绘制原始图片（应用了滤镜）
        this.ctx.putImageData(imageData, imageRect.x, imageRect.y);
        
        // 再绘制其他内容（路径文字等）
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.mainCanvas.width;
        tempCanvas.height = this.mainCanvas.height;
        
        // 在临时画布上绘制当前状态
        tempCtx.drawImage(currentCanvas, 0, 0);
        
        // 创建剪切路径，排除图片区域
        tempCtx.beginPath();
        tempCtx.rect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        tempCtx.rect(imageRect.x, imageRect.y, imageRect.width, imageRect.height);
        tempCtx.clip('evenodd');
        
        // 将非图片区域的内容绘制回主画布
        this.ctx.drawImage(tempCanvas, 0, 0);
        
        this.saveToHistory('filter');
    }
}

// 初始化编辑器
window.addEventListener('load', () => {
    const editor = new ImageEditor();
    
    // 设置初始模式
    document.querySelector('.mode-btn[data-mode="basic"]').click();
}); 