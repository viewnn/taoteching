// 兼容性 polyfill（部分旧版 webview 不支持 NodeList.forEach / Array.from）
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function(fn, ctx) {
        for (var i = 0; i < this.length; i++) fn.call(ctx, this[i], i, this);
    };
}
if (typeof NodeList !== 'undefined' && NodeList.prototype && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
}
// 安全的 NodeList 遍历（避免 Array.from / forEach 兼容问题）
function $each(sel, fn) {
    var nl = document.querySelectorAll(sel);
    for (var i = 0; i < nl.length; i++) fn(nl[i], i);
}
// 全局变量
let bookData = [];
let currentIndex = 0;
const storageKey = "daoDeJingReadIndex";

const mask = document.getElementById("mask");
const catalogList = document.getElementById("catalogList");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const readWrap = document.getElementById("readWrap");

// 读取本地阅读记录
function loadProgress() {
    const save = localStorage.getItem(storageKey);
    if(save !== null){
        const idx = parseInt(save);
        if(!isNaN(idx) && idx >=0 && idx < bookData.length){
            currentIndex = idx;
        }
    }
}
function saveProgress(){
    localStorage.setItem(storageKey, currentIndex);
}

// 渲染侧边目录（支持模糊搜索：匹配章节标题、原文、译文）
function renderCatalog(keyword){
    const kw = (keyword || "").trim().toLowerCase();
    catalogList.innerHTML = "";
    for(let i = 0; i < bookData.length; i++){
        const item = bookData[i];
        const haystack = (
            (item.chapter || "") + " " +
            (item.original || "") + " " +
            (item.translation || "")
        ).toLowerCase();
        if(kw && haystack.indexOf(kw) === -1) continue;
        let div = document.createElement("div");
        div.className = "catalog-item";
        div.innerText = item.chapter;
        div.onclick = (function(idx){
            return function(){
                switchChapter(idx);
                mask.classList.remove("show");
            };
        })(i);
        catalogList.appendChild(div);
    }
    if(kw && catalogList.children.length === 0){
        catalogList.innerHTML = '<div class="loading-tip">未找到匹配章节</div>';
    }
}

// 上下章按钮显隐控制
function updateNavBtn(){
    prevBtn.style.visibility = currentIndex <= 0 ? "hidden" : "visible";
    nextBtn.style.visibility = currentIndex >= bookData.length -1 ? "hidden" : "visible";
}

// 将文本按 xlsx 中的真实换行符 \n 同步换行展示
// 同时转义 HTML 特殊字符，避免数据中的 < > 被当作标签执行
function textToHtml(s){
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n/g, "<br>");
}

// 切换章节渲染内容（适配你的json字段）
function switchChapter(index){
    currentIndex = index;
    saveProgress();
    const data = bookData[currentIndex];
    const typeEl = document.getElementById("chapterType");
    if(typeEl) typeEl.innerText = data.type || "";
    $each(".chap-title", function(el){ el.innerText = data.chapter; });
    document.querySelector(".yuanwen-text").innerHTML = textToHtml(data.original);
    document.querySelector(".zhushi-text").innerHTML = textToHtml(data.translation);
    document.querySelector(".zongjie-text").innerHTML = textToHtml(data.summary);
    updateNavBtn();
}

prevBtn.onclick = () => {
    if(currentIndex > 0) switchChapter(currentIndex - 1);
}
nextBtn.onclick = () => {
    if(currentIndex < bookData.length - 1) switchChapter(currentIndex + 1);
}

// 复制当前章节原文到剪贴板
const copyBtn = document.getElementById("copyBtn");
copyBtn.onclick = async () => {
    if(!bookData.length) return;
    const text = bookData[currentIndex].original || "";
    const originalLabel = copyBtn.innerText;
    try {
        await navigator.clipboard.writeText(text);
        copyBtn.innerText = "已复制";
    } catch (err) {
        // 兼容降级方案
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            copyBtn.innerText = "已复制";
        } catch (e) {
            copyBtn.innerText = "复制失败";
        }
        document.body.removeChild(ta);
    }
    setTimeout(()=>{ copyBtn.innerText = originalLabel; }, 1500);
}

// 标签切换
$each(".tab-item", function(tab){
    tab.onclick = function(){
        $each(".tab-item", function(t){ t.classList.remove("active"); });
        this.classList.add("active");
        var viewId = this.dataset.view;
        $each(".view", function(v){ v.classList.remove("active"); });
        document.getElementById(viewId).classList.add("active");
    }
});

// 内容区域左右滑动切换tab（整个内容卡片区域均可滑动）
// 左滑 -> 切换到左边的tab(前一个)；右滑 -> 切换到右边的tab(后一个)
// 已在原文(最左)时无法左滑；已在总结(最右)时无法右滑
(function(){
    const swipeArea = document.querySelector('.content-card');
    if(!swipeArea) return;
    let startX = 0, startY = 0, startT = 0;
    const threshold = 50;      // 最小水平滑动距离(px)
    const maxDuration = 600;   // 滑动最大耗时(ms)
    swipeArea.addEventListener('touchstart', function(e){
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startT = Date.now();
    }, { passive: true });
    swipeArea.addEventListener('touchend', function(e){
        if(Date.now() - startT > maxDuration) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if(Math.abs(dx) < threshold) return;            // 滑动距离不足
        if(Math.abs(dx) < Math.abs(dy)) return;         // 垂直滑动为主，避免影响上下滚动
        const tabs = document.querySelectorAll('.tab-item');
        let idx = -1;
        for(let i = 0; i < tabs.length; i++){
            if(tabs[i].classList.contains('active')){ idx = i; break; }
        }
        if(idx < 0) return;
        if(dx < 0){
            // 左滑 -> 左边tab(前一个)
            if(idx > 0) tabs[idx - 1].click();
        } else {
            // 右滑 -> 右边tab(后一个)
            if(idx < tabs.length - 1) tabs[idx + 1].click();
        }
    }, { passive: true });
})();

// 日夜切换
function toggleTheme(){
    if(document.body.dataset.theme === "dark"){
        delete document.body.dataset.theme;
    }else{
        document.body.dataset.theme = "dark";
    }
}

// 目录弹窗
const catalogSearch = document.getElementById("catalogSearch");
document.getElementById("openCatalog").onclick = ()=>{
    mask.classList.add("show");
    catalogSearch.value = "";
    renderCatalog("");
    catalogList.scrollTop = 0;
};
document.getElementById("closeCatalog").onclick = ()=>mask.classList.remove("show");
mask.onclick = (e)=>{
    if(e.target === mask) mask.classList.remove("show");
};
// 目录弹窗：打开时锁定背景滚动，关闭时恢复
(function(){
    const lockBody = function(locked){
        document.body.style.overflow = locked ? 'hidden' : '';
    };
    const _openCatalog = document.getElementById("openCatalog").onclick;
    document.getElementById("openCatalog").onclick = function(){
        _openCatalog.call(this);
        lockBody(true);
    };
    const _closeCatalog = document.getElementById("closeCatalog").onclick;
    document.getElementById("closeCatalog").onclick = function(){
        _closeCatalog.call(this);
        lockBody(false);
    };
    mask.addEventListener('click', function(e){
        if(e.target === mask) lockBody(false);
    });
})();
catalogSearch.addEventListener("input", ()=>{
    renderCatalog(catalogSearch.value);
});

// 加载外部book.xlsx 核心接入逻辑
async function loadBookJson() {
    try {
        const res = await fetch("./book.xlsx");
        if (!res.ok) throw new Error("xlsx文件读取失败，请检查文件路径");
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawArr = XLSX.utils.sheet_to_json(ws, { defval: "" });
        // 过滤空行、空白章节
        bookData = rawArr.filter(item => {
            const ch = String(item.chapter || "");
            return ch.trim() !== "";
        });
        // 确保4个字段存在（缺失时补空字符串）
        bookData = bookData.map(item => ({
            chapter: String(item.chapter || ""),
            original: String(item.original || ""),
            translation: String(item.translation || ""),
            summary: String(item.summary || ""),
            type: String(item.type || ""),
        }));
        // 清除加载提示
        readWrap.innerHTML = `
            <div class="view active" id="yuanwen">
                <div class="chap-title"></div>
                <div class="yuanwen-text"></div>
            </div>
            <div class="view" id="zhushi">
                <div class="chap-title"></div>
                <div class="zhushi-text"></div>
            </div>
            <div class="view" id="zongjie">
                <div class="chap-title"></div>
                <div class="zongjie-text"></div>
            </div>
        `;
        // 初始化页面
        loadProgress();
        renderCatalog();
        switchChapter(currentIndex);
    } catch (err) {
        readWrap.innerHTML = `<div class="loading-tip" style="color:#c33">数据加载失败：${err.message}<br>请确保html与book.xlsx放在同一文件夹，且SheetJS库已正常加载</div>`;
        console.error("XLSX加载错误：", err);
    }
}

// 页面启动加载xlsx
loadBookJson();
