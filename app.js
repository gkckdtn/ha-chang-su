const state = loadState();
const elements = {
  projectForm: document.getElementById('projectForm'),
  projectName: document.getElementById('projectName'),
  projectDescription: document.getElementById('projectDescription'),
  projectLabels: document.getElementById('projectLabels'),
  projectList: document.getElementById('projectList'),
  labelList: document.getElementById('labelList'),
  addLabelBtn: document.getElementById('addLabelBtn'),
  imageInput: document.getElementById('imageInput'),
  imageGrid: document.getElementById('imageGrid'),
  mainImage: document.getElementById('mainImage'),
  canvas: document.getElementById('drawCanvas'),
  activeLabel: document.getElementById('activeLabel'),
  annotationList: document.getElementById('annotationList'),
  autoLabelBtn: document.getElementById('autoLabelBtn'),
  deleteAnnoBtn: document.getElementById('deleteAnnoBtn'),
  resetBtn: document.getElementById('resetBtn'),
  exportBtn: document.getElementById('exportBtn'),
  projectCount: document.getElementById('projectCount'),
  imageCount: document.getElementById('imageCount')
};

const settingsInputs = {
  detectorSource: document.getElementById('detectorSource'),
  detectorEndpoint: document.getElementById('detectorEndpoint'),
  detectorToken: document.getElementById('detectorToken'),
  samEndpoint: document.getElementById('samEndpoint'),
  samToken: document.getElementById('samToken'),
  saveBtn: document.getElementById('saveSettingsBtn')
};

let drawing = false;
let startPoint = null;
let selectedAnnotation = null;
let detectorModelPromise = null;

init();

function init() {
  elements.projectForm.addEventListener('submit', onCreateProject);
  elements.addLabelBtn.addEventListener('click', onAddLabel);
  elements.imageInput.addEventListener('change', onUploadImages);
  elements.activeLabel.addEventListener('change', () => highlightActiveLabel());
  elements.autoLabelBtn.addEventListener('click', onAutoLabel);
  document.getElementById('samBtn')?.addEventListener('click', onSamLabel);
  elements.deleteAnnoBtn.addEventListener('click', onDeleteSelected);
  elements.resetBtn.addEventListener('click', resetAll);
  elements.exportBtn.addEventListener('click', exportJson);
  settingsInputs.saveBtn.addEventListener('click', onSaveSettings);

  elements.canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  renderProjects();
  renderLabels();
  renderImages();
  renderWorkspace();
  renderSettings();
}

function loadState() {
  try {
    const saved = localStorage.getItem('labeling-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      const defaults = defaultState();
      return {
        ...defaults,
        ...parsed,
        settings: { ...defaults.settings, ...(parsed.settings || {}) }
      };
    }
  } catch (err) {
    console.warn('Failed to load state', err);
  }
  return defaultState();
}

function defaultState() {
  return {
    projects: [],
    currentProjectId: null,
    currentImageId: null,
    settings: {
      detectorSource: 'browser',
      detectorEndpoint: '',
      detectorToken: '',
      samEndpoint: '',
      samToken: ''
    }
  };
}

function saveState() {
  localStorage.setItem('labeling-state', JSON.stringify(state));
}

function onCreateProject(event) {
  event.preventDefault();
  const name = elements.projectName.value.trim();
  if (!name) return;
  const labels = (elements.projectLabels.value || '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  const project = {
    id: crypto.randomUUID(),
    name,
    description: elements.projectDescription.value.trim(),
    labels: labels.length ? labels : ['object'],
    images: []
  };
  state.projects.unshift(project);
  state.currentProjectId = project.id;
  state.currentImageId = null;
  saveState();
  elements.projectForm.reset();
  renderProjects();
  renderLabels();
  renderImages();
  renderWorkspace();
}

function renderProjects() {
  elements.projectList.innerHTML = '';
  state.projects.forEach((project) => {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.innerHTML = `<strong>${project.name}</strong><br><small>${project.description || '설명 없음'}</small>`;
    const right = document.createElement('div');
    right.className = 'annotation-actions';
    const count = document.createElement('span');
    count.className = 'pill';
    count.textContent = `${project.images.length} imgs`;
    const btn = document.createElement('button');
    btn.className = 'small ghost';
    btn.textContent = '열기';
    btn.addEventListener('click', () => {
      state.currentProjectId = project.id;
      state.currentImageId = project.images[0]?.id || null;
      saveState();
      renderProjects();
      renderLabels();
      renderImages();
      renderWorkspace();
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'small ghost danger';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', () => deleteProject(project.id));
    right.append(count, btn, deleteBtn);
    li.append(info, right);
    if (state.currentProjectId === project.id) li.classList.add('active');
    elements.projectList.appendChild(li);
  });
  elements.projectCount.textContent = `${state.projects.length}개`;
}

function getCurrentProject() {
  return state.projects.find((p) => p.id === state.currentProjectId) || null;
}
function getCurrentImage() {
  const project = getCurrentProject();
  if (!project) return null;
  return project.images.find((img) => img.id === state.currentImageId) || null;
}

function renderLabels() {
  const project = getCurrentProject();
  elements.labelList.innerHTML = '';
  elements.activeLabel.innerHTML = '';
  if (!project) return;
  project.labels.forEach((label) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${label}</span>`;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '삭제';
    removeBtn.className = 'small ghost danger';
    removeBtn.addEventListener('click', () => deleteLabel(label));
    li.appendChild(removeBtn);
    elements.labelList.appendChild(li);
    const option = document.createElement('option');
    option.value = label;
    option.textContent = label;
    elements.activeLabel.appendChild(option);
  });
  highlightActiveLabel();
}

function onAddLabel() {
  const project = getCurrentProject();
  if (!project) return alert('먼저 프로젝트를 선택하세요.');
  const value = prompt('추가할 라벨 이름을 입력하세요');
  if (value && !project.labels.includes(value)) {
    project.labels.push(value);
    saveState();
    renderLabels();
  }
}

function onUploadImages(event) {
  const project = getCurrentProject();
  if (!project) return alert('프로젝트를 먼저 선택하세요.');
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        project.images.unshift({
          id: crypto.randomUUID(),
          name: file.name,
          dataUrl: reader.result,
          width: img.width,
          height: img.height,
          annotations: []
        });
        if (!state.currentImageId) state.currentImageId = project.images[0].id;
        saveState();
        renderImages();
        renderWorkspace();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}

function renderImages() {
  const project = getCurrentProject();
  elements.imageGrid.innerHTML = '';
  if (!project) return;
  project.images.forEach((img) => {
    const div = document.createElement('div');
    div.className = 'thumb';
    if (state.currentImageId === img.id) div.classList.add('active');
    const imageEl = document.createElement('img');
    imageEl.src = img.dataUrl;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = img.name;
    div.append(imageEl, meta);
    div.addEventListener('click', () => {
      state.currentImageId = img.id;
      saveState();
      renderImages();
      renderWorkspace();
    });
    elements.imageGrid.appendChild(div);
  });
  elements.imageCount.textContent = `${project.images.length}개`;
}

function renderWorkspace() {
  const project = getCurrentProject();
  const image = getCurrentImage();
  selectedAnnotation = null;
  elements.annotationList.innerHTML = '';

  if (!project) {
    elements.mainImage.src = '';
    elements.canvas.width = elements.canvas.height = 0;
    return;
  }
  if (!image) {
    elements.mainImage.src = '';
    elements.canvas.width = elements.canvas.height = 0;
    return;
  }

  elements.mainImage.src = image.dataUrl;
  elements.mainImage.onload = () => {
    const { clientWidth, clientHeight } = elements.mainImage;
    elements.canvas.width = clientWidth;
    elements.canvas.height = clientHeight;
    drawAnnotations();
  };

  image.annotations.forEach((anno) => {
    const li = document.createElement('li');
    const wrap = document.createElement('div');
    wrap.className = 'annotation-item';
    wrap.innerHTML = `<strong>${anno.label}</strong><small>${fmtRect(anno)}</small>`;
    const actions = document.createElement('div');
    actions.className = 'annotation-actions';
    const selectBtn = document.createElement('button');
    selectBtn.textContent = '선택';
    selectBtn.className = 'small ghost';
    selectBtn.addEventListener('click', () => {
      selectedAnnotation = anno.id;
      highlightActiveLabel();
      drawAnnotations();
    });
    actions.append(selectBtn);
    li.append(wrap, actions);
    if (selectedAnnotation === anno.id) li.classList.add('active');
    elements.annotationList.appendChild(li);
  });
}

function highlightActiveLabel() {
  elements.activeLabel.classList.add('accented');
}

function deleteLabel(label) {
  const project = getCurrentProject();
  if (!project) return;
  if (!confirm(`${label} 라벨을 삭제하고 관련 어노테이션을 제거할까요?`)) return;
  project.labels = project.labels.filter((l) => l !== label);
  project.images.forEach((img) => {
    img.annotations = img.annotations.filter((a) => a.label !== label);
  });
  if (elements.activeLabel.value === label) {
    elements.activeLabel.value = project.labels[0] || '';
  }
  saveState();
  renderLabels();
  renderWorkspace();
}

function deleteProject(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;
  if (!confirm(`${project.name} 프로젝트를 삭제할까요?`)) return;
  state.projects = state.projects.filter((p) => p.id !== projectId);
  if (state.currentProjectId === projectId) {
    state.currentProjectId = state.projects[0]?.id || null;
    state.currentImageId = state.currentProjectId ? (state.projects[0].images[0]?.id || null) : null;
  }
  saveState();
  renderProjects();
  renderLabels();
  renderImages();
  renderWorkspace();
}

function onPointerDown(event) {
  const image = getCurrentImage();
  if (!image) return;
  drawing = true;
  startPoint = getRelativePoint(event);
}

function onPointerMove(event) {
  if (!drawing) return;
  const ctx = elements.canvas.getContext('2d');
  drawAnnotations();
  const current = getRelativePoint(event);
  const rect = normalizeRect(startPoint, current);
  drawRect(ctx, rect, '#f97316');
}

function onPointerUp(event) {
  if (!drawing) return;
  drawing = false;
  const project = getCurrentProject();
  const image = getCurrentImage();
  if (!project || !image) return;

  const endPoint = getRelativePoint(event);
  const rect = normalizeRect(startPoint, endPoint);
  if (rect.w < 0.01 || rect.h < 0.01) return;

  const annotation = {
    id: crypto.randomUUID(),
    label: elements.activeLabel.value,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h
  };
  image.annotations.push(annotation);
  saveState();
  renderWorkspace();
}

function getRelativePoint(event) {
  const bounds = elements.canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height
  };
}

function normalizeRect(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function drawAnnotations() {
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  const image = getCurrentImage();
  if (!image) return;

  image.annotations.forEach((anno) => {
    const color = anno.id === selectedAnnotation ? '#22d3ee' : '#a855f7';
    drawRect(ctx, anno, color);
    drawLabel(ctx, anno, color);
  });
}

function drawRect(ctx, rect, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  const { width, height } = elements.canvas;
  ctx.strokeRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height);
  ctx.restore();
}

function drawLabel(ctx, rect, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = '12px Inter';
  ctx.textBaseline = 'top';
  const { width, height } = elements.canvas;
  const x = rect.x * width;
  const y = rect.y * height;
  ctx.fillRect(x, y, ctx.measureText(rect.label).width + 10, 20);
  ctx.fillStyle = '#0b132b';
  ctx.fillText(rect.label, x + 5, y + 4);
  ctx.restore();
}

function fmtRect(rect) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  return `${pct(rect.x)}, ${pct(rect.y)} → ${pct(rect.w)}, ${pct(rect.h)}`;
}

async function onAutoLabel() {
  const image = getCurrentImage();
  if (!image) return alert('이미지를 먼저 선택하세요.');
  try {
    const results = await runDetector(image);
    if (!results.length) return alert('감지된 객체가 없습니다.');
    image.annotations.push(...results.map((bbox) => ({ id: crypto.randomUUID(), ...bbox })));
    saveState();
    renderWorkspace();
  } catch (err) {
    console.error(err);
    alert('오토라벨링 중 오류가 발생했습니다. 콘솔을 확인하세요.');
  }
}

async function runDetector(image) {
  const settings = state.settings || defaultState().settings;
  if (settings.detectorSource === 'remote' && settings.detectorEndpoint) {
    return runRemoteDetector(image, settings);
  }
  return runBrowserDetector(image);
}

async function runBrowserDetector(image) {
  const model = await loadBrowserDetector();
  const imgEl = await loadImageElement(image.dataUrl);
  const predictions = await model.detect(imgEl);
  const width = image.width || imgEl.naturalWidth;
  const height = image.height || imgEl.naturalHeight;
  return predictions
    .filter((p) => p.score >= 0.4)
    .map((p) => ({
      label: p.class || elements.activeLabel.value,
      x: p.bbox[0] / width,
      y: p.bbox[1] / height,
      w: p.bbox[2] / width,
      h: p.bbox[3] / height
    }));
}

async function loadBrowserDetector() {
  if (!detectorModelPromise) {
    detectorModelPromise = new Promise(async (resolve, reject) => {
      try {
        if (!window.tf) {
          await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.19.0/dist/tf.min.js');
        }
        if (!window.cocoSsd) {
          await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd');
        }
        const model = await cocoSsd.load();
        resolve(model);
      } catch (err) {
        detectorModelPromise = null;
        reject(err);
      }
    });
  }
  return detectorModelPromise;
}

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function runRemoteDetector(image, settings) {
  const response = await fetch(settings.detectorEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.detectorToken ? { Authorization: settings.detectorToken } : {})
    },
    body: JSON.stringify({ image: image.dataUrl })
  });
  if (!response.ok) throw new Error('원격 오토라벨 엔드포인트 호출 실패');
  const data = await response.json();
  const boxes = data.boxes || [];
  const width = image.width;
  const height = image.height;
  return boxes.map((b) => {
    const [x1, y1, x2, y2] = b.box;
    const isNormalized = x2 <= 1 && y2 <= 1;
    const w = isNormalized ? x2 - x1 : (x2 - x1) / width;
    const h = isNormalized ? y2 - y1 : (y2 - y1) / height;
    return {
      label: b.label || elements.activeLabel.value,
      x: isNormalized ? x1 : x1 / width,
      y: isNormalized ? y1 : y1 / height,
      w,
      h
    };
  });
}

async function onSamLabel() {
  const image = getCurrentImage();
  if (!image) return alert('이미지를 먼저 선택하세요.');
  const settings = state.settings || defaultState().settings;
  if (!settings.samEndpoint) return alert('SAM 엔드포인트 URL을 설정하세요.');
  const prompt = selectedAnnotation
    ? image.annotations.find((a) => a.id === selectedAnnotation)
    : null;
  const box = prompt
    ? [prompt.x, prompt.y, prompt.x + prompt.w, prompt.y + prompt.h]
    : [0.25, 0.25, 0.75, 0.75];
  try {
    const samBoxes = await runSamRequest(image, settings, box);
    if (!samBoxes.length) return alert('SAM 결과가 없습니다.');
    image.annotations.push(
      ...samBoxes.map((b) => ({ id: crypto.randomUUID(), label: b.label || elements.activeLabel.value, ...b }))
    );
    saveState();
    renderWorkspace();
  } catch (err) {
    console.error(err);
    alert('SAM 호출 중 오류가 발생했습니다. 엔드포인트 설정을 확인하세요.');
  }
}

async function runSamRequest(image, settings, promptBox) {
  const response = await fetch(settings.samEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.samToken ? { Authorization: settings.samToken } : {})
    },
    body: JSON.stringify({ image: image.dataUrl, box: promptBox })
  });
  if (!response.ok) throw new Error('SAM 엔드포인트 호출 실패');
  const data = await response.json();
  const boxes = data.boxes || (data.box ? [data.box] : []);
  return boxes.map((b) => {
    const [x1, y1, x2, y2] = b.box || b;
    const isNormalized = x2 <= 1 && y2 <= 1;
    const width = image.width;
    const height = image.height;
    return {
      label: b.label,
      x: isNormalized ? x1 : x1 / width,
      y: isNormalized ? y1 : y1 / height,
      w: isNormalized ? x2 - x1 : (x2 - x1) / width,
      h: isNormalized ? y2 - y1 : (y2 - y1) / height
    };
  });
}

function onDeleteSelected() {
  const image = getCurrentImage();
  if (!image || !selectedAnnotation) return;
  image.annotations = image.annotations.filter((anno) => anno.id !== selectedAnnotation);
  selectedAnnotation = null;
  saveState();
  renderWorkspace();
}

function resetAll() {
  if (!confirm('모든 프로젝트와 라벨을 삭제할까요?')) return;
  const fresh = defaultState();
  state.projects = fresh.projects;
  state.currentImageId = fresh.currentImageId;
  state.currentProjectId = fresh.currentProjectId;
  state.settings = fresh.settings;
  saveState();
  renderProjects();
  renderLabels();
  renderImages();
  renderWorkspace();
  renderSettings();
}

function exportJson() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'annotations.json';
  a.click();
  URL.revokeObjectURL(url);
}

function renderSettings() {
  const settings = state.settings || defaultState().settings;
  settingsInputs.detectorSource.value = settings.detectorSource;
  settingsInputs.detectorEndpoint.value = settings.detectorEndpoint;
  settingsInputs.detectorToken.value = settings.detectorToken;
  settingsInputs.samEndpoint.value = settings.samEndpoint;
  settingsInputs.samToken.value = settings.samToken;
}

function onSaveSettings() {
  state.settings = {
    detectorSource: settingsInputs.detectorSource.value,
    detectorEndpoint: settingsInputs.detectorEndpoint.value.trim(),
    detectorToken: settingsInputs.detectorToken.value.trim(),
    samEndpoint: settingsInputs.samEndpoint.value.trim(),
    samToken: settingsInputs.samToken.value.trim()
  };
  detectorModelPromise = null;
  saveState();
  alert('모델 설정이 저장되었습니다.');
}
