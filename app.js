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

let drawing = false;
let startPoint = null;
let selectedAnnotation = null;

init();

function init() {
  elements.projectForm.addEventListener('submit', onCreateProject);
  elements.addLabelBtn.addEventListener('click', onAddLabel);
  elements.imageInput.addEventListener('change', onUploadImages);
  elements.activeLabel.addEventListener('change', () => highlightActiveLabel());
  elements.autoLabelBtn.addEventListener('click', onAutoLabel);
  elements.deleteAnnoBtn.addEventListener('click', onDeleteSelected);
  elements.resetBtn.addEventListener('click', resetAll);
  elements.exportBtn.addEventListener('click', exportJson);

  elements.canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  renderProjects();
  renderLabels();
  renderImages();
  renderWorkspace();
}

function loadState() {
  try {
    const saved = localStorage.getItem('labeling-state');
    if (saved) return JSON.parse(saved);
  } catch (err) {
    console.warn('Failed to load state', err);
  }
  return { projects: [], currentProjectId: null, currentImageId: null };
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
    right.append(count, btn);
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
    li.textContent = label;
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
  const label = elements.activeLabel.value;
  const bbox = await detectMainRegion(image.dataUrl);
  const annotation = { id: crypto.randomUUID(), label, ...bbox };
  image.annotations.push(annotation);
  saveState();
  renderWorkspace();
}

async function detectMainRegion(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;

      let minX = img.width, minY = img.height, maxX = 0, maxY = 0, count = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const idx = (y * img.width + x) * 4;
          const [r, g, b, a] = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
          const bright = (r + g + b) / 3;
          if (a > 15 && bright < 240) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            count++;
          }
        }
      }

      if (!count) {
        resolve({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 });
        return;
      }
      resolve({
        x: minX / img.width,
        y: minY / img.height,
        w: (maxX - minX) / img.width,
        h: (maxY - minY) / img.height
      });
    };
    img.src = dataUrl;
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
  state.projects = [];
  state.currentImageId = null;
  state.currentProjectId = null;
  saveState();
  renderProjects();
  renderLabels();
  renderImages();
  renderWorkspace();
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
