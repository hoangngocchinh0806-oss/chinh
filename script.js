// Cấu hình cơ bản
let selectedLayout = 4; // Mặc định là 4 ảnh dọc
let stream = null;
let capturedImages = [];
const webcamElement = document.getElementById('webcam');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownText = document.getElementById('countdown-text');
const flashScreen = document.getElementById('flash-screen');
let faceDetectionRunning = false;
let faceDetectionReady = false;
let faceDetectionErrorShown = false;
let autoCaptureActive = false;
let autoCaptureFrames = 0;
let autoCaptureTimer = null;
let autoCaptureTriggered = false;
let countdownValue = 0;
let countdownTimer = null;
let lastFaceDetectedAt = 0;

// Khởi tạo ngày hiện tại ở chân ảnh
const today = new Date();
document.getElementById('strip-date').innerText = today.getFullYear() + '.' + String(today.getMonth() + 1).padStart(2, '0') + '.' + String(today.getDate()).padStart(2, '0');

// Kiểm tra lỗi hệ thống ngay khi tải trang
window.addEventListener('DOMContentLoaded', () => {
    checkInitialSystemErrors();
    loadFaceDetectionModels();
});

async function loadFaceDetectionModels() {
    if (!window.faceapi) {
        console.warn('face-api.js chưa được tải');
        return;
    }

    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);
        faceDetectionReady = true;
        console.log('Face detection models loaded');
    } catch (error) {
        console.warn('Không thể tải mô hình nhận diện khuôn mặt:', error);
        if (!faceDetectionErrorShown) {
            faceDetectionErrorShown = true;
            const statusEl = document.getElementById('capture-status');
            if (statusEl) {
                statusEl.innerText = 'Không thể tải nhận diện khuôn mặt';
            }
        }
    }
}

function setupFaceOverlay() {
    const canvas = document.getElementById('face-overlay');
    if (!canvas || !webcamElement) return;

    if (webcamElement.videoWidth && webcamElement.videoHeight) {
        canvas.width = webcamElement.videoWidth;
        canvas.height = webcamElement.videoHeight;
    } else {
        canvas.width = 640;
        canvas.height = 480;
    }

    canvas.style.width = '100%';
    canvas.style.height = '100%';
}

function updateFaceStatus(count) {
    const statusEl = document.getElementById('capture-status');
    if (!statusEl) return;

    if (count > 0) {
        statusEl.innerText = `Đang phát hiện khuôn mặt`;
    } else {
        statusEl.innerText = 'Đang xem trước';
    }
}

function drawFaceBox(ctx, detection, displaySize) {
    const box = detection.detection.box;
    const x = box.x;
    const y = box.y;
    const width = box.width;
    const height = box.height;
    const pulse = (Date.now() / 300) % 2 < 1;

    ctx.save();
    ctx.strokeStyle = pulse ? '#22d3ee' : '#f472b6';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 18;
    ctx.shadowColor = pulse ? '#38bdf8' : '#ec4899';
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = pulse ? '#f472b6' : '#22d3ee';
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
    ctx.restore();
}

function startFaceDetectionLoop() {
    if (!faceDetectionReady || faceDetectionRunning || !webcamElement || !stream) return;

    const canvas = document.getElementById('face-overlay');
    if (!canvas) return;

    setupFaceOverlay();
    const ctx = canvas.getContext('2d');
    const displaySize = { width: webcamElement.videoWidth, height: webcamElement.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);
    faceDetectionRunning = true;

    const detect = async () => {
        if (!faceDetectionRunning || !stream || !webcamElement.videoWidth) return;

        try {
            const detections = await faceapi
                .detectAllFaces(webcamElement, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks();

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const resized = faceapi.resizeResults(detections, displaySize);

            if (resized.length === 1) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                resized.forEach((detection) => {
                    drawFaceBox(ctx, detection, displaySize);
                });
                updateFaceStatus(1);
                lastFaceDetectedAt = Date.now();

                if (!autoCaptureTriggered) {
                    autoCaptureFrames += 1;
                    if (autoCaptureFrames >= 4) {
                        autoCaptureTriggered = true;
                        autoCaptureFrames = 0;
                        startCountdownBeforeCapture();
                    }
                }
            } else {
                autoCaptureFrames = 0;
                autoCaptureTriggered = false;
                if (countdownTimer) {
                    clearInterval(countdownTimer);
                    countdownTimer = null;
                }
                countdownOverlay.classList.add('hidden');
                updateFaceStatus(resized.length);
            }
        } catch (error) {
            console.warn('Lỗi vòng lặp nhận diện khuôn mặt:', error);
        }

        if (faceDetectionRunning) {
            setTimeout(detect, 200);
        }
    };

    detect();
}

function stopFaceDetectionLoop() {
    faceDetectionRunning = false;
    autoCaptureActive = false;
    autoCaptureFrames = 0;
    autoCaptureTriggered = false;
    countdownValue = 0;
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    if (autoCaptureTimer) clearTimeout(autoCaptureTimer);
    const canvas = document.getElementById('face-overlay');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    countdownOverlay.classList.add('hidden');
}

function startCountdownBeforeCapture() {
    if (!stream || autoCaptureActive) return;
    autoCaptureActive = true;
    countdownValue = 3;
    countdownText.innerText = countdownValue;
    countdownOverlay.classList.remove('hidden');
    const statusEl = document.getElementById('capture-status');
    if (statusEl) {
        statusEl.innerText = 'Chuẩn bị chụp...';
    }

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        countdownValue -= 1;
        if (countdownValue > 0) {
            countdownText.innerText = countdownValue;
        } else {
            clearInterval(countdownTimer);
            countdownTimer = null;
            countdownOverlay.classList.add('hidden');
            takeAutoCapture();
        }
    }, 1000);
}

function takeAutoCapture() {
    if (!stream || !document.getElementById('step-capture').classList.contains('hidden')) {
        capturePhoto(capturedImages.length);
        playShutterSound();
        flashScreen.classList.remove('opacity-0');
        flashScreen.classList.add('opacity-100');
        setTimeout(() => {
            flashScreen.classList.remove('opacity-100');
            flashScreen.classList.add('opacity-0');
        }, 150);
    }
    autoCaptureActive = false;
    autoCaptureTriggered = false;
    autoCaptureFrames = 0;
}

// 1. CHỌN LAYOUT
function selectLayout(num) {
    selectedLayout = num;
    const btn4 = document.getElementById('btn-layout-4');
    const btn1 = document.getElementById('btn-layout-1');

    if(num === 4) {
        btn4.className = "py-3 px-4 rounded-xl border-2 border-indigo-500 text-indigo-500 font-bold bg-indigo-50 flex flex-col items-center justify-center transition";
        btn1.className = "py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-500 font-bold hover:border-indigo-300 flex flex-col items-center justify-center transition";
    } else {
        btn1.className = "py-3 px-4 rounded-xl border-2 border-indigo-500 text-indigo-500 font-bold bg-indigo-50 flex flex-col items-center justify-center transition";
        btn4.className = "py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-500 font-bold hover:border-indigo-300 flex flex-col items-center justify-center transition";
    }
}

// HÀM TỰ ĐỘNG KIỂM TRA LỖI BẢO MẬT & MÔI TRƯỜNG CHẠY
function checkInitialSystemErrors() {
    const diagPanel = document.getElementById('diagnostic-panel');
    const diagMsg = document.getElementById('diagnostic-msg');

    // Lỗi 1: Chạy file trực tiếp bằng cách nhấp đúp file HTML (Không dùng Secure Context)
    if (!window.isSecureContext) {
        diagPanel.classList.remove('hidden');
        diagMsg.innerHTML = `
            Bạn đang mở file trực tiếp bằng cách nhấp đúp tệp tin (Đường dẫn bắt đầu bằng <strong class="underline text-red-700">file:///</strong>). <br><br>
            <strong>Cách sửa:</strong> Trình duyệt nghiêm cấm tuyệt đối truy cập camera ở chế độ này để bảo vệ quyền riêng tư. Bạn bắt buộc phải chạy file thông qua <strong>Live Server trong VS Code</strong> (địa chỉ dạng <strong class="text-green-700">http://127.0.0.1:5500</strong> hoặc <strong class="text-green-700">http://localhost</strong>). Hãy thực hiện theo hướng dẫn Open Folder ở bước trước!
        `;
        return true;
    }

    // Lỗi 2: Trình duyệt không hỗ trợ các tính năng API Media (Rất hiếm gặp, chỉ xảy ra trên IE cũ)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        diagPanel.classList.remove('hidden');
        diagMsg.innerHTML = "Trình duyệt này không hỗ trợ hoặc đã vô hiệu hóa thư viện Camera hệ thống. Vui lòng chuyển sang sử dụng Google Chrome, Edge hoặc Firefox phiên bản mới nhất.";
        return true;
    }
    return false;
}

// 2. KÍCH HOẠT CAMERA VỚI CHẨN ĐOÁN LỖI NÂNG CAO
async function startCamera() {
    // Kiểm tra lỗi hệ thống trước khi khởi động
    if (checkInitialSystemErrors()) return;

    const diagPanel = document.getElementById('diagnostic-panel');
    const diagMsg = document.getElementById('diagnostic-msg');
    diagPanel.classList.add('hidden'); // Tạm ẩn bảng lỗi trước khi chạy

    try {
        // Thử khởi động với cấu hình tối ưu
        stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 }, 
                facingMode: "user" 
            },
            audio: false
        });
        
        webcamElement.srcObject = stream;
        
        // Chuyển sang giao diện chụp ảnh
        document.getElementById('step-setup').classList.add('hidden');
        document.getElementById('step-capture').classList.remove('hidden');
        renderProgressSlots();
        setupFaceOverlay();
        await loadFaceDetectionModels();
        startFaceDetectionLoop();

    } catch (err) {
        console.warn("Thử camera cấu hình cao thất bại, đang thử cấu hình tối giản...", err);
        
        // FALLBACK: Thử khởi động camera với cấu hình cơ bản nhất (chấp nhận mọi chất lượng)
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
            
            webcamElement.srcObject = stream;
            document.getElementById('step-setup').classList.add('hidden');
            document.getElementById('step-capture').classList.remove('hidden');
            renderProgressSlots();
            setupFaceOverlay();
            await loadFaceDetectionModels();
            startFaceDetectionLoop();

        } catch (fallbackErr) {
            // PHÂN TÍCH CHÍNH XÁC NGUYÊN NHÂN KHÔNG HIỆN THÔNG BÁO XIN QUYỀN
            diagPanel.classList.remove('hidden');
            
            if (fallbackErr.name === 'NotAllowedError' || fallbackErr.name === 'PermissionDeniedError') {
                diagMsg.innerHTML = `
                    <strong>Lỗi chặn quyền (Permission Denied):</strong> <br>
                    Bạn (hoặc hệ thống) đã chặn quyền truy cập Camera của trang web này trước đó nên trình duyệt không hiển thị lại hộp thoại xin phép nữa.<br><br>
                    <strong>Cách sửa:</strong> <br>
                    1. Hãy nhìn lên thanh địa chỉ của trình duyệt (phần nhập link trang web), bấm vào biểu tượng <strong>khóa móc 🔒</strong> hoặc <strong>hình Camera bị gạch chéo 🚫</strong>. <br>
                    2. Chuyển trạng thái Máy ảnh (Camera) sang <strong>Cho phép (Allow)</strong>. <br>
                    3. Nhấn nút <strong>Tải lại trang (Reload)</strong> phía dưới để áp dụng.
                `;
            } else if (fallbackErr.name === 'NotFoundError' || fallbackErr.name === 'DevicesNotFoundError') {
                diagMsg.innerHTML = `
                    <strong>Lỗi không tìm thấy Camera (Devices Not Found):</strong> <br>
                    Hệ thống không tìm thấy bất kỳ thiết bị ghi hình (webcam) nào kết nối với máy tính này. Vui lòng cắm lại webcam hoặc kiểm tra Driver camera của bạn.
                `;
            } else if (fallbackErr.name === 'NotReadableError' || fallbackErr.name === 'TrackStartError') {
                diagMsg.innerHTML = `
                    <strong>Camera đang bị chiếm dụng (Not Readable):</strong> <br>
                    Thiết bị camera của bạn đang hoạt động nhưng bị một phần mềm khác khóa quyền sử dụng. <br><br>
                    <strong>Cách sửa:</strong> Hãy tắt hoàn toàn các phần mềm đang dùng camera khác như: Zoom, Microsoft Teams, OBS Studio, Zalo, hoặc các tab trình duyệt khác, sau đó tải lại trang này.
                `;
            } else {
                diagMsg.innerHTML = `
                    <strong>Gặp lỗi không xác định:</strong> ${fallbackErr.message} <br>
                    Vui lòng kiểm tra lại thiết bị phần cứng camera hoặc thử mở bằng trình duyệt ẩn danh (Incognito Mode).
                `;
            }
            console.error("Lỗi hoàn toàn:", fallbackErr);
        }
    }
}

// Tắt camera và quay lại ban đầu
function stopCameraAndReset() {
    stopFaceDetectionLoop();
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('step-capture').classList.add('hidden');
    document.getElementById('step-setup').classList.remove('hidden');
}

// Vẽ danh sách slot tiến trình
function renderProgressSlots() {
    const container = document.getElementById('progress-slots');
    container.innerHTML = '';
    for(let i = 0; i < selectedLayout; i++) {
        container.innerHTML += `
            <div id="slot-${i}" class="aspect-video bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm font-bold">
                ${i + 1}
            </div>
        `;
    }
}

// 3. ÂM THANH GIẢ LẬP (Sử dụng Web Audio API)
function playShutterSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
        console.log("Web Audio API không được hỗ trợ hoặc bị chặn.");
    }
}

// 4. TIẾN TRÌNH CHỤP ẢNH TỰ ĐỘNG (SEQUENCE CAPTURE)
async function triggerSession() {
    capturedImages = [];
    document.getElementById('btn-trigger-capture').disabled = true;
    document.getElementById('btn-trigger-capture').classList.add('opacity-50');
    document.getElementById('capture-status').innerText = "Đang trong phiên chụp...";

    for (let i = 0; i < selectedLayout; i++) {
        await startIndividualCountdown(3);
        capturePhoto(i);
        await delay(1000);
    }

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    showEditor();
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startIndividualCountdown(seconds) {
    return new Promise((resolve) => {
        countdownOverlay.classList.remove('hidden');
        let count = seconds;
        countdownText.innerText = count;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownText.innerText = count;
            } else {
                clearInterval(interval);
                countdownOverlay.classList.add('hidden');
                resolve();
            }
        }, 1000);
    });
}

function capturePhoto(index) {
    flashScreen.classList.remove('opacity-0');
    flashScreen.classList.add('opacity-100');
    playShutterSound();
    
    setTimeout(() => {
        flashScreen.classList.remove('opacity-100');
        flashScreen.classList.add('opacity-0');
    }, 150);

    const canvas = document.createElement('canvas');
    canvas.width = webcamElement.videoWidth || 640;
    canvas.height = webcamElement.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(webcamElement, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg');
    capturedImages.push(dataUrl);

    const slot = document.getElementById(`slot-${index}`);
    slot.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover rounded-lg">`;
    slot.classList.remove('border-dashed');
    slot.classList.add('border-indigo-500');
}

// 5. CHUYỂN SANG BỘ BIÊN TẬP (EDITOR)
function showEditor() {
    document.getElementById('step-capture').classList.add('hidden');
    document.getElementById('step-editor').classList.remove('hidden');

    const stripImagesContainer = document.getElementById('strip-images');
    stripImagesContainer.innerHTML = '';

    capturedImages.forEach((imgSrc) => {
        stripImagesContainer.innerHTML += `
            <div class="relative w-full overflow-hidden rounded bg-gray-100 border border-gray-200" style="aspect-ratio: 4/3;">
                <img src="${imgSrc}" class="photo-item w-full h-full object-cover select-none transition" style="filter: none;">
            </div>
        `;
    });
}

// 6. THAO TÁC BIÊN TẬP
function changeFrameColor(bgColor) {
    const strip = document.getElementById('photostrip');
    strip.style.backgroundColor = bgColor;
    
    const stripText = document.getElementById('strip-text');
    const stripDate = document.getElementById('strip-date');
    
    if(bgColor === '#111827') {
        stripText.style.color = '#f3f4f6';
        stripDate.style.color = '#9ca3af';
    } else {
        stripText.style.color = '#1f2937';
        stripDate.style.color = '#9ca3af';
    }
}

function applyFrameStyle(style) {
    const strip = document.getElementById('photostrip');
    const baseStyles = {
        soft: 'border-radius: 1.5rem; box-shadow: 0 18px 35px rgba(15, 23, 42, 0.12); border: 1px solid #e5e7eb;',
        glow: 'border-radius: 1.5rem; box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.2), 0 18px 35px rgba(15, 23, 42, 0.16); border: 2px solid #22d3ee;',
        polaroid: 'border-radius: 0.75rem; box-shadow: 0 12px 25px rgba(15, 23, 42, 0.16); border: 8px solid white; padding: 0.75rem;',
        korean: 'border-radius: 2rem; box-shadow: 0 16px 30px rgba(244, 114, 182, 0.18); border: 3px solid #f472b6; padding: 0.9rem;'
    };
    strip.style.cssText += baseStyles[style] || '';
}

function applyFilter(filterString) {
    const photos = document.querySelectorAll('.photo-item');
    photos.forEach(img => {
        img.style.filter = filterString;
    });
}

function addSticker(content, type = 'emoji') {
    const strip = document.getElementById('photostrip');
    const stickerEl = document.createElement('div');
    stickerEl.className = 'sticker-item absolute text-4xl select-none p-2 group';
    stickerEl.style.left = '40%';
    stickerEl.style.top = '30%';

    let innerMarkup = '';
    if (type === 'gif') {
        innerMarkup = `<img src="${content}" alt="gif" class="w-20 h-20 object-cover rounded-xl shadow-md">`;
    } else {
        innerMarkup = `<span>${content}</span>`;
    }

    stickerEl.innerHTML = `
        ${innerMarkup}
        <button class="delete-btn absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center shadow focus:outline-none">&times;</button>
    `;

    stickerEl.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        stickerEl.remove();
    });

    makeElementDraggable(stickerEl);
    strip.appendChild(stickerEl);
}

function addStickerFromInput() {
    const input = document.getElementById('gif-input');
    const value = input.value.trim();
    if (!value) {
        alert('Vui lòng nhập đường dẫn hoặc chọn file.');
        return;
    }

    const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(value);
    if (isImage) {
        addSticker(value, 'gif');
    } else {
        addSticker(value, 'gif');
    }
    input.value = '';
}

function handleGifFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        addSticker(e.target.result, 'gif');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function makeElementDraggable(el) {
    let isDragging = false;
    let startX, startY;
    let initLeft, initTop;

    el.addEventListener('pointerdown', function(e) {
        if (e.target.classList.contains('delete-btn')) return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initLeft = el.offsetLeft;
        initTop = el.offsetTop;
        
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    el.addEventListener('pointermove', function(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = `${initLeft + dx}px`;
        el.style.top = `${initTop + dy}px`;
    });

    el.addEventListener('pointerup', function(e) {
        if (!isDragging) return;
        isDragging = false;
        el.releasePointerCapture(e.pointerId);
    });
}

function updateStripText() {
    const val = document.getElementById('input-strip-text').value;
    document.getElementById('strip-text').innerText = val || 'My Memories';
}

// 7. XUẤT ẢNH & IN ẢNH
function downloadStrip() {
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach(btn => btn.style.display = 'none');

    const target = document.getElementById('photostrip');
    
    html2canvas(target, {
        scale: 3,
        useCORS: true,
        backgroundColor: null
    }).then(canvas => {
        deleteButtons.forEach(btn => btn.removeAttribute('style'));

        const link = document.createElement('a');
        link.download = `k-photobooth-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(err => {
        console.error("Lỗi xuất ảnh:", err);
        alert("Không thể xuất ảnh.");
    });
}

function printStrip() {
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach(btn => btn.style.display = 'none');

    html2canvas(document.getElementById('photostrip'), { scale: 2 }).then(canvas => {
        deleteButtons.forEach(btn => btn.removeAttribute('style'));
        
        const dataUrl = canvas.toDataURL('image/png');
        const windowContent = `
            <!DOCTYPE html>
            <html>
            <head><title>Print Photobooth</title></head>
            <body style="margin:0; display:flex; justify-content:center; align-items:center; height:100vh;">
                <img src="${dataUrl}" style="max-height:100%; max-width:100%;" onload="window.print(); window.close();" />
            </body>
            </html>
        `;
        
        const printWin = window.open('', '', 'width=600,height=800');
        printWin.document.open();
        printWin.write(windowContent);
        printWin.document.close();
    });
}

function restartApp() {
    if (confirm("Chụp phiên mới?")) {
        document.getElementById('step-editor').classList.add('hidden');
        document.getElementById('step-setup').classList.remove('hidden');
        capturedImages = [];
        const inputBtn = document.getElementById('btn-trigger-capture');
        inputBtn.disabled = false;
        inputBtn.classList.remove('opacity-50');
    }
}
