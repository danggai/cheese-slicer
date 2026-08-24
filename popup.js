let currentVideo = null;
let currentUrl = null;

async function loadSettings() {
    const settings = await chrome.storage.local.get({
        duration: 60,
        resolution: "max",
        sendLoginInfo: false
    });

    document.getElementById("duration").value = settings.duration;
    document.getElementById("resolution").value = settings.resolution;
    document.getElementById("sendLoginInfo").checked =
        settings.sendLoginInfo;
}

async function saveSettings() {
    const duration = Math.max(
        1,
        Math.min(
            3600,
            Number(document.getElementById("duration").value) || 60
        )
    );

    const resolution =
        document.getElementById("resolution").value;

    const sendLoginInfo =
        document.getElementById("sendLoginInfo").checked;

    await chrome.storage.local.set({
        duration,
        resolution,
        sendLoginInfo
    });

    document.getElementById("duration").value = duration;
}

async function getNaverAuthCookies() {
    const [nidAut, nidSes] = await Promise.all([
        chrome.cookies.get({
            url: "https://chzzk.naver.com/",
            name: "NID_AUT"
        }),
        chrome.cookies.get({
            url: "https://chzzk.naver.com/",
            name: "NID_SES"
        })
    ]);

    return {
        aut: nidAut?.value || "",
        ses: nidSes?.value || ""
    };
}

async function updateLoginStatus() {
    const statusElement =
        document.getElementById("loginStatus");

    try {
        const cookies = await getNaverAuthCookies();

        const loggedIn =
            cookies.aut.length > 0 &&
            cookies.ses.length > 0;

        if (loggedIn) {
            statusElement.textContent = "🟢 로그인됨";
            statusElement.className =
                "login-status logged-in";
        } else {
            statusElement.textContent = "⚪ 로그아웃";
            statusElement.className =
                "login-status logged-out";
        }
    } catch (error) {
        console.error(
            "네이버 로그인 상태 확인 실패:",
            error
        );

        statusElement.textContent = "⚪ 로그아웃";
        statusElement.className =
            "login-status logged-out";
    }
}

async function loadVideoInfo() {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tab || !tab.id) {
        showError("현재 탭을 확인할 수 없습니다.");
        return;
    }

    const url = tab.url || "";

    const match = url.match(
        /^https:\/\/chzzk\.naver\.com\/video\/(\d+)(?:[\/?#].*)?$/
    );

    if (!match) {
        showError("치지직 영상 페이지에서 실행해주세요.");
        return;
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const videos = Array.from(
                    document.querySelectorAll("video")
                );

                if (!videos.length) {
                    return null;
                }

                const video =
                    videos.find(
                        v => !v.paused && v.readyState >= 2
                    ) ||
                    videos.find(
                        v => v.readyState >= 2
                    ) ||
                    videos[0];

                return {
                    currentTime: Number.isFinite(video.currentTime)
                        ? video.currentTime
                        : 0,
                    width: video.videoWidth,
                    height: video.videoHeight
                };
            }
        });

        const info = results?.[0]?.result;

        if (!info) {
            showError("현재 영상 정보를 가져올 수 없습니다.");
            return;
        }

        currentUrl = url;
        currentVideo = info;

        updateVideoInfo();
        document.getElementById("openButton").disabled = false;
    } catch (error) {
        console.error(error);
        showError("영상 정보를 가져오는 중 오류가 발생했습니다.");
    }
}

function updateVideoInfo() {
    const match = currentUrl.match(
        /^https:\/\/chzzk\.naver\.com\/video\/(\d+)/
    );

    const videoId = match ? match[1] : "-";
    const start = formatTime(
        Math.floor(currentVideo.currentTime)
    );

    document.getElementById("videoInfo").innerHTML = `
        <div>
            <div class="label">영상 ID</div>
            <div class="value">${videoId}</div>
        </div>
        <div>
            <div class="label">시작 시간</div>
            <div class="value">${start}</div>
        </div>
        <div>
            <div class="label">영상 해상도</div>
            <div class="value">${currentVideo.height || "알 수 없음"}p</div>
        </div>
    `;
}

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(
        (totalSeconds % 3600) / 60
    );
    const seconds = totalSeconds % 60;

    return (
        String(hours).padStart(2, "0") + ":" +
        String(minutes).padStart(2, "0") + ":" +
        String(seconds).padStart(2, "0")
    );
}

function showError(message) {
    document.getElementById("videoInfo").innerHTML = `
        <div style="color:#888;">${message}</div>
    `;
    document.getElementById("openButton").disabled = true;
}

async function openGuide() {
    if (!currentUrl || !currentVideo) {
        return;
    }

    await saveSettings();

    const duration = Number(
        document.getElementById("duration").value
    );

    const selectedResolution =
        document.getElementById("resolution").value;

    const sendLoginInfo =
        document.getElementById("sendLoginInfo").checked;

    const start = formatTime(
        Math.floor(currentVideo.currentTime)
    );

    let guideUrl =
        "https://cheese-slice.pages.dev/?" +
        "url=" + encodeURIComponent(currentUrl) +
        "&start=" + encodeURIComponent(start) +
        "&dur=" + encodeURIComponent(duration);

    if (selectedResolution !== "max") {
        guideUrl +=
            "&res=" +
            encodeURIComponent(
                Number(selectedResolution)
            );
    }

    if (sendLoginInfo) {
        const cookies = await getNaverAuthCookies();

        if (cookies.aut && cookies.ses) {
            guideUrl +=
                "&aut=" + cookies.aut +
                "&ses=" + cookies.ses;
        }
    }

    await chrome.tabs.create({
        url: guideUrl
    });
}

document
    .getElementById("openButton")
    .addEventListener("click", openGuide);

document
    .getElementById("duration")
    .addEventListener("change", saveSettings);

document
    .getElementById("resolution")
    .addEventListener("change", saveSettings);

document
    .getElementById("sendLoginInfo")
    .addEventListener("change", saveSettings);

(async () => {
    await loadSettings();
    await updateLoginStatus();
    await loadVideoInfo();
})();
