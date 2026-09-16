/**
 * 设备实战脚本：Xiaomi 13 专用运行入口 (脱敏实战版)
 * 
 * 运行环境：Hamibot / AutoJs6
 * 目标 App：政务/民生医疗服务 App (我的南京)
 * 执行策略：人工提前进入列表页 + 极短时间窗口毫秒级高频轮询 + 固定坐标盲点 + 自动回退
 */

// ================= 1. 时间控制参数 =================
const SCRIPT_START_TIME = "05:59:59.970"; // 目标触发时间 (时:分:秒.毫秒)
const TIME_POLL_INTERVAL_MS = 5;           // 时间轮询间隔(毫秒)
const GLOBAL_TIMEOUT_MS = 3600000;         // 超时防死循环 (60分钟)

// ================= 2. 页面与控件标识 =================
const PAGE_TEXT_PERSON_LIST = "医生选择";
const PAGE_TEXT_SCHEDULE = "选择日期";     // 排班页标示
const PAGE_TEXT_CONFIRM = "信息确认";      // 提交确认页标示
const CONFIRM_BUTTON_TEXT = "确认";        // 确认按钮文本

// ================= 3. 小米 13 专机校准坐标 =================
// 目标人员点击坐标 (脱敏处理，替换真实姓名)
const PERSON_POINT_A = [999, 666];         // 人员 A (周三、四排班)
const PERSON_POINT_B = [999, 947];         // 人员 B (周一、二、五、六排班)

// 日期滑动参数
const DATE_PAGE_STABLE_WAIT_MS = 300;      // 排班页渲染等待
const DATE_SWIPE_MAX_COUNT = 3;            // 滑动次数
const DATE_SWIPE_START_X = 1070;           // 滑动起点 X
const DATE_SWIPE_END_X = 1;                // 滑动终点 X
const DATE_SWIPE_Y = 1000;                 // 滑动 Y
const DATE_SWIPE_DURATION_MS = 25;         // 单次滑动耗时 (极速手势)
const DATE_SWIPE_WAIT_MS = 5;

// 最新放号日期点击坐标
const DATE_CLICK_POINT_WEEKDAY = [443, 950];   // 周一至周五目标日期坐标
const DATE_CLICK_POINT_SATURDAY = [1050, 950]; // 周六目标日期坐标
const DATE_CLICK_WAIT_MS = 400;                // 等待下方时段列表刷新

// 时段优先级与坐标 (自上而下按顺序依次轮询，支持自动回退)
const TIME_SLOTS = [
    { name: "08:00-08:30", point: [573, 1171] },
    { name: "10:30-11:00", point: [573, 1925.5] },
    { name: "11:00-11:30", point: [573, 2074.5] },
    { name: "10:00-10:30", point: [573, 1776] },
    { name: "08:30-09:00", point: [573, 1323.5] },
    { name: "09:00-09:30", point: [573, 1499.5] },
    { name: "09:30-10:00", point: [573, 1625] }
];

// ================= 4. 人机协同提醒配置 =================
const ENABLE_SUCCESS_VIBRATE = true;
const ENABLE_SUCCESS_BEEP = true;
const SUCCESS_VIBRATE_DURATION_MS = 5000;

const APP_PACKAGE_NAME = "com.hoperun.intelligenceportal";

// ================= 辅助函数 =================

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

// ================= 主执行流程 =================

function main() {
    console.show();
    sleep(100);
    console.log("[INFO] " + getFormattedTime() + " - Xiaomi 13 自动化排班脚本启动...");

    let today = new Date().getDay();
    let targetPoint = null;
    let targetName = "";

    if ([1, 2, 6].indexOf(today) !== -1) {
        targetName = "人员_A";
        targetPoint = PERSON_POINT_A;
    } else if ([3, 4, 5, 0].indexOf(today) !== -1) {
        targetName = "人员_B";
        targetPoint = PERSON_POINT_B;
    }

    console.log("[INFO] 今日星期" + today + "，调度目标: " + targetName);

    app.launch(APP_PACKAGE_NAME);
    sleep(1000);

    let targetTimeMs = getTargetTimeMs();
    let loopStartTime = new Date().getTime();

    // 毫秒级轮询等待
    while (true) {
        let now = new Date().getTime();
        if (now - loopStartTime > GLOBAL_TIMEOUT_MS) return;
        if (now >= targetTimeMs) break;
        sleep(TIME_POLL_INTERVAL_MS);
    }

    // 1. 点击目标进入排班页
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

    // 2. 连续快速盲滑日期栏
    sleep(DATE_PAGE_STABLE_WAIT_MS);
    for (let i = 0; i < DATE_SWIPE_MAX_COUNT; i++) {
        gesture(DATE_SWIPE_DURATION_MS, [DATE_SWIPE_START_X, DATE_SWIPE_Y], [DATE_SWIPE_END_X, DATE_SWIPE_Y + 2]);
        sleep(DATE_SWIPE_WAIT_MS);
    }

    // 3. 选中最新日期
    let datePoint = (today === 6) ? DATE_CLICK_POINT_SATURDAY : DATE_CLICK_POINT_WEEKDAY;
    click(datePoint[0], datePoint[1]);
    sleep(DATE_CLICK_WAIT_MS);

    // 4. 轮询时段（命中即走，未命中自动回退下一个）
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

    // 5. 提交确认
    sleep(50);
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
