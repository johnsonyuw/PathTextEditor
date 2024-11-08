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

        this.currentMode = 'none';
        this.isDrawing = false;
        this.pathPoints = [];
        this.originalImage = null;
        this.currentPath = null;
        
        this.setupEventListeners();
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
        document.getElementById('cropBtn').addEventListener('click', () => {
            this.currentMode = 'crop';
        });

        document.getElementById('pathTextBtn').addEventListener('click', () => {
            this.currentMode = 'pathText';
            document.getElementById('pathTextControls').style.display = 'block';
        });

        // 画布事件
        this.mainCanvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.mainCanvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.mainCanvas.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // 保存按钮
        document.getElementById('saveBtn').addEventListener('click', this.saveImage.bind(this));

        // 添加文字内容变化监听
        document.getElementById('pathText').addEventListener('input', () => {
            if (this.currentPath) {
                this.redrawPathText();
            }
        });

        // 添加字体大小变化监听
        document.getElementById('fontSize').addEventListener('input', () => {
            if (this.currentPath) {
                this.redrawPathText();
            }
        });

        // 设置默认文字
        document.getElementById('pathText').value = '这是路径文字效果';
    }

    handleMouseDown(e) {
        if (this.currentMode !== 'pathText') return;
        
        this.isDrawing = true;
        const rect = this.mainCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.pathPoints = [{x, y}];
        
        // 清除临时画布
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    }

    handleMouseMove(e) {
        if (!this.isDrawing || this.currentMode !== 'pathText') return;

        const rect = this.mainCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.pathPoints.push({x, y});
        
        // 绘制路径预览
        this.drawPathPreview();
    }

    handleMouseUp() {
        if (this.currentMode !== 'pathText' || !this.isDrawing) return;
        
        this.isDrawing = false;
        if (this.pathPoints.length >= 2) {
            this.currentPath = [...this.pathPoints]; // 保存当前路径
            this.drawPathText(); // 绘制文字
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
    redrawPathText() {
        if (!this.currentPath) return;
        
        // 恢复保存的路径
        this.pathPoints = [...this.currentPath];
        
        // 清除临时画布
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
        
        // 重新绘制文字
        this.drawPathText();
    }

    drawPathText() {
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
        if (this.pathPoints.length < 2) return;

        const text = document.getElementById('pathText').value || '这是路径文字效果';
        const fontSize = parseInt(document.getElementById('fontSize').value) || 20;
        
        this.tempCtx.font = `${fontSize}px Arial`;
        this.tempCtx.fillStyle = '#000';
        
        let totalLength = 0;
        for (let i = 1; i < this.pathPoints.length; i++) {
            const dx = this.pathPoints[i].x - this.pathPoints[i-1].x;
            const dy = this.pathPoints[i].y - this.pathPoints[i-1].y;
            totalLength += Math.sqrt(dx * dx + dy * dy);
        }

        let currentLength = 0;
        let textIndex = 0;

        for (let i = 1; i < this.pathPoints.length; i++) {
            const start = this.pathPoints[i-1];
            const end = this.pathPoints[i];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            while (currentLength < totalLength) {
                const progress = (currentLength % segmentLength) / segmentLength;
                const x = start.x + dx * progress;
                const y = start.y + dy * progress;

                this.tempCtx.save();
                this.tempCtx.translate(x, y);
                this.tempCtx.rotate(angle);
                this.tempCtx.fillText(text[textIndex % text.length], 0, 0);
                this.tempCtx.restore();

                textIndex++;
                currentLength += fontSize;
            }
        }

        // 立即应用文字到主画布
        this.applyPathText();
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
}

// 初始化编辑器
window.addEventListener('load', () => {
    new ImageEditor();
}); 