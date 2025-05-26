const webapp = window.Telegram.WebApp;
 webapp.ready();
 webapp.expand();
  
 // Get signed initData string
 const initData = webapp.initData;

 // Set theme variables from Telegram theme params
 const params = webapp.themeParams;
 const root = document.documentElement;
 
 if (params) {
     root.style.setProperty('--tg-theme-bg-color', params.bg_color);
     root.style.setProperty('--tg-theme-text-color', params.text_color);
     root.style.setProperty('--tg-theme-hint-color', params.hint_color);
     root.style.setProperty('--tg-theme-link-color', params.link_color);
     root.style.setProperty('--tg-theme-button-color', params.button_color);
     root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
 }
 
 // 2. DOM Elements and Variables
 const navButtons = document.querySelectorAll('.nav-button');
 const views = document.querySelectorAll('.view');
 const locationButton = document.getElementById('locationButton');
 const continueButton = document.getElementById('continueButton');
 const errorMessage = document.getElementById('error-message');
 const video = document.getElementById('video');
 const canvas = document.getElementById('canvas');
 const captureButton = document.getElementById('captureButton');
 const backButton = document.getElementById('backButton');
 const odometerInput = document.getElementById('odometerInput');
 const odometer = document.getElementById('odometer');
 const continueToPhotos = document.getElementById('continueToPhotos');
 const sessionVideo = document.getElementById('sessionVideo');
 const sessionCanvas = document.getElementById('sessionCanvas');
 const sessionCaptureButton = document.getElementById('sessionCaptureButton');
 const photoCounter = document.getElementById('photoCounter');
 const photoGrid = document.getElementById('photoGrid');
 const urlParams = new URLSearchParams(window.location.search);
 const chatId = urlParams.get('chat_id');
 const msgId  = urlParams.get('msg_id');
 const carId  = urlParams.get('car_id');
 
 const action = urlParams.get('action') || 'start';
 
 let currentMarker = null;
 let stream = null;
 let photoTaken = false;
 let sessionPhotos = [];
 const REQUIRED_PHOTOS = 4;
 
 // 3. Initialize Map
 const map = L.map('map').setView([51.505, -0.09], 13);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
     attribution: '© OpenStreetMap contributors'
 }).addTo(map);
 
 odometer.addEventListener('keydown', (e) => {
     if (e.key === 'Enter') {
         e.preventDefault();
         
         if (!odometer.value) {
             showError('Пожалуйста, введите показания одометра');
             return;
         }
         
         // Добавляем вибрацию
         if (window.Telegram?.WebApp?.HapticFeedback) {
             Telegram.WebApp.HapticFeedback.impactOccurred('light');
         }
         
         switchView('session');
     }
 });
 
 // 4. Utility Functions
 function showError(message) {
     errorMessage.textContent = message;
     errorMessage.style.display = 'block';
 }
 
 function switchView(view) {
     hideSpinner();
     navButtons.forEach(btn => {
         btn.classList.toggle('active', btn.dataset.view === view);
     });
     views.forEach(v => {
         v.classList.toggle('active', v.id === `${view}View`);
     });
 
     // Всегда показываем nav-button при переключении вкладок
     document.querySelector('.nav-tabs').classList.remove('hidden');
 
     if (view === 'camera' || view === 'session') {
         startCamera(view);
     } else {
         stopCamera();
     }
 
     if (view === 'session') {
         updateSessionUI();
     }
 }

 if (!initData) {
    showForbiddenError();
} else {
    initApp();
    switchView('map');
}
 
 function createDraggableMarker(latlng) {
     if (currentMarker) {
         map.removeLayer(currentMarker);
     }
     currentMarker = L.marker(latlng, { draggable: true }).addTo(map);
     continueButton.classList.remove('hidden');
 }
 
 async function startCamera(view) {
     const videoElement = view === 'session' ? sessionVideo : video;
     const captureBtn = view === 'session' ? sessionCaptureButton : captureButton;
     const canvasEl = view === 'session' ? sessionCanvas : canvas;
 
     if (stream) stopCamera(); // 💡 предотвращаем повторный вызов
 
     if (photoTaken) resetCameraView(); // 💡 возможно, сделать reset по view
 
     try {
         stream = await navigator.mediaDevices.getUserMedia({
             video: { facingMode: 'environment' }
         });
         videoElement.srcObject = stream;
 
         await videoElement.play().catch(err => {
             console.warn('Auto-play error:', err);
         });
 
         if (view === 'camera') {
             captureButton.classList.remove('hidden');
             captureButton.style.opacity = '1';
             captureButton.style.display = '';
             captureButton.disabled = false;
         }
 
         if (view === 'session') {
             sessionCaptureButton.disabled = false;
             sessionCaptureButton.classList.remove('hidden');
             sessionCaptureButton.style.opacity = '1';
             sessionCaptureButton.style.display = 'block';
         }
 
         videoElement.style.display = 'block';
         canvasEl.style.display = 'none';
     } catch (err) {
         console.error('Camera error:', err);
         showError('Не удалось получить доступ к камере. Разрешите доступ и попробуйте снова.');
         captureBtn.disabled = true;
     }
 }
 
 function stopCamera() {
     if (stream) {
         stream.getTracks().forEach(track => track.stop());
         stream = null;
     }
     [video, sessionVideo].forEach(v => v.srcObject = null);
     [captureButton, sessionCaptureButton].forEach(btn => btn.disabled = true);
 }
 
 function resetCameraView() {
     photoTaken = false;
     video.style.display = 'block';
     canvas.style.display = 'none';
     captureButton.style.display = 'block';
     odometerInput.classList.add('hidden');
     backButton.classList.add('hidden');
     odometer.value = '';
 }
 
 function capturePhoto(video, canvas) {
    const ctx = canvas.getContext('2d');
    const width = video.videoWidth;
    const height = video.videoHeight;

    // Устанавливаем размеры canvas как у видеопотока
    canvas.width = width;
    canvas.height = height;

    // Просто рисуем весь кадр без кропа
    ctx.drawImage(video, 0, 0, width, height);

    // Возвращаем base64-изображение
    return canvas.toDataURL('image/jpeg');
}
 
 function captureAndCropPhoto(video, canvas) {
     const ctx = canvas.getContext('2d');
     const width = video.videoWidth;
     const height = video.videoHeight;
 
     const cropWidth = width; // например, 80% от ширины
     const cropHeight = height; // например, центр экрана
     const cropX = (width - cropWidth) / 2;
     const cropY = (height - cropHeight) / 2;
 
     canvas.width = cropWidth;
     canvas.height = cropHeight;
     ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
 
     return canvas.toDataURL('image/jpeg');
 }
 
 
 function updateSessionUI() {
     photoCounter.innerHTML = '';
     for (let i = 0; i < REQUIRED_PHOTOS; i++) {
         const slot = document.createElement('div');
         slot.className = `photo-slot-mini ${sessionPhotos[i] ? 'filled' : 'empty'}`;
         if (sessionPhotos[i]) {
             const img = document.createElement('img');
             img.src = sessionPhotos[i];
             img.alt = `Photo ${i + 1}`;
             slot.appendChild(img);
         } else {
             slot.textContent = i + 1;
         }
         photoCounter.appendChild(slot);
     }
 }
 
 function showNotification(message) {
     const notification = document.createElement('div');
     notification.className = 'notification';
     notification.textContent = message;
     document.body.appendChild(notification);
 
     notification.offsetHeight;
     notification.classList.add('show');
 
     setTimeout(() => {
         notification.classList.remove('show');
         setTimeout(() => notification.remove(), 300);
     }, 2000);
 }
 
 function showSpinner() {
     const el = document.getElementById('photoStatus');
     el.classList.remove('hidden', 'check');
     el.querySelector('.spinner').style.display = 'block';
 }
 
 function hideSpinner() {
     document.getElementById('photoStatus').classList.add('hidden');
 }
 
 function showCheckmark() {
     const el = document.getElementById('photoStatus');
     el.classList.add('check');
     el.querySelector('.spinner').style.display = 'none';
 }
 
 
 function hideReviewButtons() {
     document.getElementById('reviewButtons').classList.add('hidden');
 }
 
 const backToCameraBtn = document.getElementById('backToCamera');
 if (backToCameraBtn) {
     backToCameraBtn.addEventListener('click', () => {
         hideSpinner();
         hideReviewButtons();
         startCamera('camera');
 
         // Показываем nav-button
         document.querySelector('.nav-tabs').classList.remove('hidden');
 
         // Возвращаем отображение captureButton
         captureButton.classList.remove('hidden');
         captureButton.disabled = false;
         captureButton.style.display = 'block';
     });
 }
 
 let reviewHandlerAttached = false;
 
 function showReviewButtons() {
     const btn = document.getElementById('submitOdometerPhoto');
 
     if (!reviewHandlerAttached) {
         btn.addEventListener('click', handleSubmitPhoto);
         reviewHandlerAttached = true;
     }
 
     document.getElementById('reviewButtons').classList.remove('hidden');
 }
 
 
 let recognizedOdometer = null;
 let lastOdometerPhoto = null;
 let lastRecognizedOdometerPhoto = null; 
 
 async function uploadOdometerPhoto(base64Photo, recognizedPhotoBase64, carId, odometerValue, initData) {
    try {
      const response = await fetch("https://autopark-gthost.amvera.io/api/odometer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `tma ${initData}`
        },
        body: JSON.stringify({
          photo: base64Photo,
          recognized_photo: recognizedPhotoBase64 || null,
          car_id: carId,
          odometer_value: odometerValue || null
        })
      });
  
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Failed to upload odometer photo");
  
      console.log("📸 Фото успешно загружено:", result);
      return result;
    } catch (error) {
      console.error("❌ Ошибка загрузки фото одометра:", error);
      return null;
    }
  }  
 

async function handleSubmitPhoto() {
    showSpinner();

    try {
        if (canvas.width === 0 || canvas.height === 0) {
            hideSpinner();
            return;
        }

        const base64image = canvas.toDataURL('image/jpeg');
        lastOdometerPhoto = base64image;

        // Только распознаем одометр, не сохраняем в S3
        const res = await fetch('https://autopark-gthost.amvera.io/api/odometer/recognize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `tma ${initData}`
            },
            body: JSON.stringify({
                photo: base64image,
                car_id: Number(carId),
                action: action
            }),
        });

        const result = await res.json();

        if (res.ok) {
            if (result.status === 'ok') {
                recognizedOdometer = result.odometer;
                showCheckmark();
                setTimeout(() => {
                    switchView('session');
                }, 1000);
            } else if (result.status === 'processing') {
                alert("Не удалось распознать значение");
                switchView('camera');
                document.getElementById('reviewButtons').classList.add('hidden');
            }
        } else {
            console.error("Ошибка при запросе: ", result);
        }
    } catch (err) {
        console.error("Ошибка запроса:", err);
    } finally {
        hideSpinner();
    }
}


 async function notifyServer(eventPayload) {
     const body = { chat_id: chatId, message_id: msgId, event: eventPayload, init_data: initData};
     try {
       const res = await fetch('https://autopark-gthost.amvera.io/api/webapp/callback', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
       });
       const json = await res.json();
       console.log('Callback response:', json);
     } catch (err) {
       console.error('Callback error:', err);
       showError(err);
       return;
     }
     // Только после того, как мы точно получили ответ:
     setTimeout(() => webapp.close(), 100);
   }
 
async function sendSessionData() {
    if (!initData) {
        showError('❌ Не удалось получить данные Telegram.');
        return;
    }

    const marker = currentMarker?.getLatLng?.();
    if (!marker) {
        showError('❌ Координаты не выбраны.');
        return;
    }

    const odo = Number(odometer.value);
    if (isNaN(odo) || odo < 0) {
        showError('❌ Пожалуйста, укажите корректный пробег.');
        return;
    }

    if (sessionPhotos.length !== REQUIRED_PHOTOS) {
        showError('❌ Необходимо 4 фото.');
        return;
    }

    if (!lastOdometerPhoto) {
        showError('❌ Отсутствует фото одометра.');
        return;
    }

    const finalOdometer = recognizedOdometer !== null && recognizedOdometer !== undefined ? recognizedOdometer : odo;

    const payload = {
        car_id: Number(carId),
        action,
        latitude: marker.lat,
        longitude: marker.lng,
        odometer: finalOdometer,
        photos: sessionPhotos,
        odometer_photo: lastOdometerPhoto,
        init_data: initData 
    };

    try {
        const res = await fetch('https://autopark-gthost.amvera.io/api/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `tma ${initData}`
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok && result.status === 'ok') {
            await notifyServer({
                event: action,
                car_id: Number(carId)
            });

            showNotification(result.message || '✅ ОК');
        } else {
            const msg = result.detail || '❌ Ошибка при отправке';
            showError(msg);
        }
    } catch (e) {
        console.error(e);
        showError('⚠️ Ошибка соединения с сервером');
    }
}
 
 function showForbiddenError() {
     document.querySelector('.container').classList.add('hidden');
     document.getElementById('forbiddenPage').classList.remove('hidden');
 }
 
 // 5. Event Listeners
 navButtons.forEach(button => {
     button.addEventListener('click', () => {
         const view = button.dataset.view;
         switchView(view);
     });
 });
 
 map.on('click', e => createDraggableMarker(e.latlng));
 
 locationButton.addEventListener('click', () => {
     if (!navigator.geolocation) {
         showError('Geolocation is not supported by your browser.');
         return;
     }
 
     navigator.geolocation.getCurrentPosition(
         ({ coords }) => {
             createDraggableMarker([coords.latitude, coords.longitude]);
             map.setView([coords.latitude, coords.longitude], 15);
         },
         () => showError('Please enable location services to continue.')
     );
 });
 
 captureButton.addEventListener('click', () => {
     const croppedPhoto = captureAndCropPhoto(video, canvas);
     stopCamera();
     canvas.style.display = 'block';
     video.style.display = 'none';
     captureButton.style.display = 'none';
 
     // Скрываем nav-button
     document.querySelector('.nav-tabs').classList.add('hidden');
     
     showReviewButtons();
 });
 
 sessionCaptureButton.addEventListener('click', () => {
     const photoData = capturePhoto(sessionVideo, sessionCanvas);
     if (sessionPhotos.length < REQUIRED_PHOTOS) {
         sessionPhotos.push(photoData);
     }
     updateSessionUI();
 
     if (sessionPhotos.length === REQUIRED_PHOTOS) {
         showNotification('📤 Отправка данных...');
         setTimeout(() => sendSessionData(), 1000);
     } else {
         setTimeout(() => startCamera('session'), 500);
     }
 });
 
 continueButton.addEventListener('click', () => switchView('camera'));
 backButton.addEventListener('click', () => startCamera('camera'));
 
 odometer.addEventListener('input', () => {
     continueToPhotos.disabled = !odometer.value;
 });
 
 continueToPhotos.addEventListener('click', () => {
     if (odometer.value) switchView('session');
 });
 
 // 6. Initialize Application
 function initApp() {
    fetch(`https://autopark-gthost.amvera.io/api/auth?car_id=${carId}&action=${action}`, {
        method: 'POST',
        headers: {
            'Authorization': `tma ${initData}`
        }
    })
    .then(res => {
        if (res.status === 403) {
            alert('⛔ У вас уже есть активная сессия. Завершите её прежде, чем начинать новую.');
            setTimeout(() => webapp.close(), 100);
            return;
        }
        return res.json();
    })
    .then(data => {
        if (data?.status === 'ok') {
            switchView('map'); 
        }
    })
    .catch(err => {
        console.error('Auth failed', err);
        alert('Ошибка авторизации.');
        alert(err);
        setTimeout(() => webapp.close(), 2000);
    });
}