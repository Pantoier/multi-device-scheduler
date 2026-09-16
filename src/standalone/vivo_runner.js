/**
 * 设备实战脚本：vivo 机型专用运行入口 (脱敏实战版)
 * 
 * 运行环境：Hamibot / AutoJs6
 * 目标 App：政务/民生医疗服务 App (我的南京)
 * 执行策略：针对 vivo 机型屏幕分辨率与手势曲线专门调校
 */

// ================= 1. 时间控制参数 =================
const SCRIPT_START_TIME = "05:59:59.970"; 
const TIME_POLL_INTERVAL_MS = 5;
const GLOBAL_TIMEOUT_MS = 3600000;

// ================= 2. 页面与控件标识 =================
const PAGE_TEXT_PERSON_LIST = "医生选择";
const PAGE_TEXT_SCHEDULE = "选择日期";
const PAGE_TEXT_CONFIRM = "信息确认";
const CONFIRM_BUTTON_TEXT = "确认";

// ================= 3. vivo 专机校准坐标 =================
const PERSON_POINT_A = [1163, 767];
const PERSON_POINT_B = [1163, 1115];

const DATE_PAGE_STABLE_WAIT_MS = 400;
const DATE_SWIPE_MAX_COUNT = 3;
const DATE_SWIPE_START_X = 1150;
const DATE_SWIPE_END_X = 1;
const DATE_SWIPE_Y = 1205;
const DATE_SWIPE_DURATION_MS = 35;
const DATE_SWIPE_WAIT_MS = 10;

const DATE_CLICK_POINT_WEEKDAY = [428, 1190];
const DATE_CLICK_POINT_SATURDAY = [1071, 1194];
const DATE_CLICK_WAIT_MS = 400;

const TIME_SLOTS = [
    { name: "09:30-10:00", point: [1111, 2003] },
    { name: "09:00-09:30", point: [1111, 1812] },
    { name: "08:30-09:00", point: [1111, 1620] },
    { name: "10:00-10:30", point: [1111, 2195] },
    { name: "11:00-11:30", point: [1111, 2580] },
    { name: "10:30-11:00", point: [1111, 2388] },
    { name: "08:00-08:30", point: [1111, 1429] }
];

// ================= 4. 提醒配置 =================
const ENABLE_SUCCESS_VIBRATE = true;
const ENABLE_SUCCESS_BEEP = true;
const SUCCESS_VIBRATE_DURATION_MS = 5000;
const APP_PACKAGE_NAME = "com.hoperun.intelligenceportal";

function getFormattedTime() {
    let d = new Date();
    let h = d.getHours(), m = d.getMinutes(), s = d.getSeconds(), ms = d.getMilliseconds();
    return (h < 10 ? '0' + h : h) + ":" +
        (m < 10 ? '0' + m : m) + ":" +
        (s < 10 ? '0' + s : s) + "." +
        (ms < 10 ? '00' + ms : (ms < 100 ? '0' + ms : ms));
}

function getTargetTimeMs() {
    let parts = SCRIPT_START_TIME.split(/[:.]/);
    let target = new Date();
    target.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3] || 0, 10));
    return target.getTime();
}

function alertSuccess() {
    if (ENABLE_SUCCESS_BEEP) {
        try {
            importClass(android.media.RingtoneManager);
            let uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (!uri) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            let rt = RingtoneManager.getRingtone(context, uri);
            if (rt) rt.play();
        } catch (e) {}
    }
    if (ENABLE_SUCCESS_VIBRATE) {
        let startTime = new Date().getTime();
        while (new Date().getTime() - startTime < SUCCESS_VIBRATE_DURATION_MS) {
            device.vibrate(1000);
            sleep(1050);
        }
    }
}

function main() {
    console.show();
    sleep(100);
    console.log("[INFO] " + getFormattedTime() + " - vivo 设备自动化排班脚本启动...");

    let today = new Date().getDay();
    let targetPoint = null;
    let targetName = "";

    if ([1, 2, 5, 6].indexOf(today) !== -1) {
        targetName = "人员_B";
        targetPoint = PERSON_POINT_B;
    } else if ([3, 4, 0].indexOf(today) !== -1) {
        targetName = "人员_A";
        targetPoint = PERSON_POINT_A;
    }

    console.log("[INFO] 今日星期" + today + "，调度目标: " + targetName);

    app.launch(APP_PACKAGE_NAME);
    sleep(1000);

    let targetTimeMs = getTargetTimeMs();
    let loopStartTime = new Date().getTime();

    while (true) {
        let now = new Date().getTime();
        if (now - loopStartTime > GLOBAL_TIMEOUT_MS) return;
        if (now >= targetTimeMs) break;
        sleep(TIME_POLL_INTERVAL_MS);
    }

    click(targetPoint[0], targetPoint[1]);
    sleep(100);

    let checkStart = new Date().getTime();
    let inSchedule = false;
    while (new Date().getTime() - checkStart <= 3000) {
        if (text(PAGE_TEXT_SCHEDULE).exists()) {
            inSchedule = true;
            break;
        }
        sleep(2);
    }
    if (!inSchedule) {
        console.error("[ERROR] 未能进入排班页，流程退出");
        return;
    }

    sleep(DATE_PAGE_STABLE_WAIT_MS);
    for (let i = 0; i < DATE_SWIPE_MAX_COUNT; i++) {
        gesture(DATE_SWIPE_DURATION_MS, [DATE_SWIPE_START_X, DATE_SWIPE_Y], [DATE_SWIPE_END_X, DATE_SWIPE_Y + 2]);
        sleep(DATE_SWIPE_WAIT_MS);
    }

    let datePoint = (today === 6) ? DATE_CLICK_POINT_SATURDAY : DATE_CLICK_POINT_WEEKDAY;
    click(datePoint[0], datePoint[1]);
    sleep(DATE_CLICK_WAIT_MS);

    let slotHit = false;
    for (let i = 0; i < TIME_SLOTS.length; i++) {
        let slot = TIME_SLOTS[i];
        click(slot.point[0], slot.point[1]);
        sleep(5);

        let tCheck = new Date().getTime();
        while (new Date().getTime() - tCheck <= 100) {
            if (text(PAGE_TEXT_CONFIRM).exists()) {
                slotHit = true;
                break;
            }
            sleep(2);
        }
        if (slotHit) break;
    }

    if (!slotHit) {
        console.error("[ERROR] 所有备选时段均已约满");
        return;
    }

    sleep(100);
    let confirmBtn = text(CONFIRM_BUTTON_TEXT).findOne(500);
    if (confirmBtn) {
        let ok = confirmBtn.click();
        if (!ok) {
            let b = confirmBtn.bounds();
            if (b) click(b.centerX(), b.centerY());
        }
        console.log("[SUCCESS] 占座成功，唤醒人工支付！");
        alertSuccess();
    }
}

try {
    main();
} catch (e) {
    console.error("执行异常: " + e.message);
}
