document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // GLOBAL VARIABLES & CONFIG
    // ==========================================
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const EFFECT_ID = 'photoToVectorArt'; // Configured Effect ID
    const DEBUG = false; // Toggle for logging
    let currentUploadedUrl = null;

    // ==========================================
    // API FUNCTIONS (REAL BACKEND WIRING)
    // ==========================================

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension
        const fileName = uniqueId + '.' + fileExtension;
        
        if (DEBUG) console.log('Starting upload for:', fileName);

        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        if (DEBUG) console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        if (DEBUG) console.log('Uploaded successfully to:', downloadUrl);
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        const endpoint = 'https://api.chromastudio.ai/image-gen';
        
        const body = {
            model: 'image-effects',
            toolType: 'image-effects',
            effectId: EFFECT_ID,
            imageUrl: imageUrl,
            userId: USER_ID,
            removeWatermark: true,
            isPrivate: true
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                // Browser handles User-Agent and Sec-CH-UA automatically
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        if (DEBUG) console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    // Poll job status until completed
    async function pollJobStatus(jobId) {
        const baseUrl = 'https://api.chromastudio.ai/image-gen';
        const POLL_INTERVAL = 2000;
        const MAX_POLLS = 60; // 2 minutes max
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json, text/plain, */*' }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            if (DEBUG) console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('Processing... (' + (polls + 1) + ')');
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // ==========================================
    // UI HELPER FUNCTIONS
    // ==========================================

    const loadingState = document.getElementById('loading-state');
    const statusBadge = document.getElementById('status-badge');
    const generateBtn = document.getElementById('generate-btn');
    const uploadPlaceholder = document.querySelector('.upload-placeholder');
    const previewImage = document.getElementById('preview-image');
    const downloadBtn = document.getElementById('download-btn');

    function showLoading() {
        if (loadingState) loadingState.classList.remove('hidden');
        if (loadingState) loadingState.style.display = 'flex'; // Ensure flex for centering
        const resultPlaceholder = document.querySelector('.result-placeholder');
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
    }

    function hideLoading() {
        if (loadingState) loadingState.classList.add('hidden');
        if (loadingState) loadingState.style.display = 'none';
    }

    function updateStatus(text) {
        if (statusBadge) {
            statusBadge.textContent = text;
            
            if (text.toLowerCase().includes('processing') || text.toLowerCase().includes('uploading')) {
                statusBadge.style.background = "var(--text-secondary)";
                statusBadge.style.color = "white";
                if (generateBtn) {
                    generateBtn.disabled = true;
                    generateBtn.textContent = text;
                }
            } else if (text === 'READY') {
                statusBadge.style.background = "var(--accent)";
                statusBadge.style.color = "white";
                if (generateBtn) {
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'Generate Vector Art';
                }
            } else if (text === 'COMPLETE') {
                statusBadge.style.background = "var(--secondary)";
                statusBadge.style.color = "white";
                if (generateBtn) {
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'Generate Again';
                }
            } else if (text === 'ERROR') {
                statusBadge.style.background = "red";
                statusBadge.style.color = "white";
                if (generateBtn) {
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'Retry';
                }
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        updateStatus('ERROR');
    }

    function showPreview(url) {
        if (previewImage) {
            previewImage.src = url;
            previewImage.classList.remove('hidden');
        }
        if (uploadPlaceholder) {
            uploadPlaceholder.classList.add('hidden');
        }
    }

    function showResultMedia(url) {
        const resultImage = document.getElementById('result-image');
        const resultPlaceholder = document.querySelector('.result-placeholder');
        
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        
        if (resultImage) {
            resultImage.src = url + '?t=' + new Date().getTime(); // Prevent caching
            resultImage.classList.remove('hidden');
            resultImage.style.display = 'block';
            // Remove the CSS filter simulation from the original script
            resultImage.style.filter = 'none';
        }

        // Store URL on download button
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.disabled = false;
        }
    }

    // ==========================================
    // 3. PLAYGROUND LOGIC (WIRED)
    // ==========================================
    
    // File Selection Handler
    async function handleFileSelect(file) {
        if (!file) return;

        try {
            showLoading();
            updateStatus('UPLOADING...');
            
            // Upload immediately
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show preview
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            hideLoading();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // Generate Button Handler
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert('Please select an image first.');
            return;
        }
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // 1. Submit Job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('PROCESSING...');
            
            // 2. Poll Status
            const result = await pollJobStatus(jobData.jobId);
            
            // 3. Extract Result URL
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.image || resultItem?.video;
            
            if (!resultUrl) {
                console.error('Full Result Object:', result);
                throw new Error('No output URL found in API response');
            }
            
            if (DEBUG) console.log('Final Result URL:', resultUrl);
            
            // 4. Show Result
            showResultMedia(resultUrl);
            currentUploadedUrl = resultUrl; // Update current URL to result for subsequent actions if needed
            
            updateStatus('COMPLETE');
            hideLoading();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // Event Listeners for Playground
    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const resetBtn = document.getElementById('reset-btn');

    // Drag & Drop
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        dropZone.addEventListener('dragover', () => dropZone.classList.add('active'));
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
        
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('active');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleFileSelect(file);
            }
        });
        
        dropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }

    // File Input
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentUploadedUrl = null;
            if (fileInput) fileInput.value = '';
            
            // Reset Preview
            if (previewImage) {
                previewImage.src = '';
                previewImage.classList.add('hidden');
            }
            if (uploadPlaceholder) uploadPlaceholder.classList.remove('hidden');
            
            // Reset Result
            const resultImage = document.getElementById('result-image');
            if (resultImage) {
                resultImage.src = '';
                resultImage.classList.add('hidden');
            }
            const resultPlaceholder = document.querySelector('.result-placeholder');
            if (resultPlaceholder) resultPlaceholder.classList.remove('hidden');
            
            // Reset Buttons
            if (generateBtn) generateBtn.disabled = true;
            if (downloadBtn) {
                downloadBtn.disabled = true;
                delete downloadBtn.dataset.url;
            }
            
            updateStatus('Waiting');
            if (statusBadge) statusBadge.style.background = "var(--border)";
            statusBadge.style.color = "var(--text)";
        });
    }

    // DOWNLOAD BUTTON LOGIC (Robust Proxy/Fetch)
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            function downloadBlob(blob, filename) {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            }

            function getExtension(url, contentType) {
                if (contentType) {
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
                    if (contentType.includes('png')) return 'png';
                    if (contentType.includes('webp')) return 'webp';
                    if (contentType.includes('svg')) return 'svg';
                }
                const match = url.match(/\.(jpe?g|png|webp|svg)/i);
                return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
            }
            
            try {
                // STRATEGY 1: ChromaStudio Proxy (Best for CORS)
                const proxyUrl = 'https://api.chromastudio.ai/download-proxy?url=' + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                
                if (!response.ok) throw new Error('Proxy failed: ' + response.status);
                
                const blob = await response.blob();
                const ext = getExtension(url, response.headers.get('content-type'));
                downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.' + ext);
                
            } catch (proxyErr) {
                console.warn('Proxy download failed, trying direct fetch:', proxyErr.message);
                
                // STRATEGY 2: Direct Fetch
                try {
                    const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                    const response = await fetch(fetchUrl, { mode: 'cors' });
                    
                    if (response.ok) {
                        const blob = await response.blob();
                        const ext = getExtension(url, response.headers.get('content-type'));
                        downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.' + ext);
                    } else {
                        throw new Error('Direct fetch failed');
                    }
                } catch (fetchErr) {
                    console.warn('Direct fetch failed:', fetchErr.message);
                    alert('Download failed due to browser security restrictions. Please right-click the image and select "Save Image As".');
                }
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // 1. MOBILE MENU TOGGLE (PRESERVED)
    // ==========================================
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('nav');
    const navLinks = document.querySelectorAll('nav a');

    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            const icon = menuToggle.querySelector('i');
            if (nav.classList.contains('active')) {
                icon.classList.replace('ph-list', 'ph-x');
            } else {
                icon.classList.replace('ph-x', 'ph-list');
            }
        });

        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.querySelector('i').classList.replace('ph-x', 'ph-list');
            });
        });
    }

    // ==========================================
    // 2. HERO ANIMATION (PRESERVED)
    // ==========================================
    function initHeroAnimation() {
        const container = document.getElementById('hero-animation-container');
        if (!container) return;

        const shapes = ['shape-square', 'shape-circle', 'shape-triangle'];
        const count = 15;

        for (let i = 0; i < count; i++) {
            const shape = document.createElement('div');
            const shapeType = shapes[Math.floor(Math.random() * shapes.length)];
            
            shape.classList.add('geo-shape', shapeType);
            shape.style.left = `${Math.random() * 100}%`;
            shape.style.animationDelay = `${Math.random() * 20}s`;
            shape.style.animationDuration = `${15 + Math.random() * 15}s`;
            
            const scale = 0.5 + Math.random() * 0.8;
            shape.style.transform = `scale(${scale})`;
            
            container.appendChild(shape);
        }
    }
    initHeroAnimation();

    // ==========================================
    // 4. FAQ ACCORDION (PRESERVED)
    // ==========================================
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(i => {
                i.classList.remove('active');
                i.querySelector('.faq-answer').style.maxHeight = null;
            });
            if (!isActive) {
                item.classList.add('active');
                const answer = item.querySelector('.faq-answer');
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    // ==========================================
    // 5. SCROLL ANIMATIONS (PRESERVED)
    // ==========================================
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in-up').forEach(el => observer.observe(el));

    // ==========================================
    // 6. MODAL LOGIC (PRESERVED)
    // ==========================================
    const openModalBtns = document.querySelectorAll('[data-modal-target]');
    const closeModalBtns = document.querySelectorAll('[data-modal-close]');
    const modals = document.querySelectorAll('.modal');

    openModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-modal-target');
            const modal = document.getElementById(targetId);
            if (modal) modal.classList.add('active');
        });
    });

    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-modal-close');
            const modal = document.getElementById(targetId);
            if (modal) modal.classList.remove('active');
        });
    });

    window.addEventListener('click', (e) => {
        modals.forEach(modal => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
});