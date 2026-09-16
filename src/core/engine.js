/**
 * 多手机自动排班与流程调度工具 - 核心驱动引擎 (AutoJs6 / Hamibot)
 * 
 * 设计架构：
 * 1. 设备适配层 (Device Profile)：屏幕分辨率、手势滑动与各操作点坐标参数解耦
 * 2. 业务调度层 (Schedule Rules)：根据星期动态分配目标排班人员与时段
 * 3. 极速触发层 (Timing & Polling)：前置预热导航 + 毫秒级轮询放号瞬间发包
 * 4. 人机协同层 (Safety Alert)：程序完成快速占座，长震动与系统铃声唤醒人工支付
 */

// ================= 全局默认配置（支持外部 JSON 覆盖或单文件嵌入） =================

var Config = {
    // 目标放号启动时间 (时:分:秒.毫秒)
    targetStartTime: "05:59:59.970",
    pollIntervalMs: 5,
    globalTimeoutMs: 3600000, // 60分钟防死循环
    appPackageName: "com.hoperun.intelligenceportal",

    // 页面特征标识
    markers: {
        doctorList: "医生选择",
        schedulePage: "选择日期",
        confirmPage: "信息确认",
        confirmButton: "确认"
    },

    // 交互缓冲时间 (毫秒)
    timing: {
        clickWaitMs: 100,
        checkIntervalMs: 2,
        checkWindowMs: 3000,
        pageStableWaitMs: 300,
        dateRefreshWaitMs: 400,
        slotClickWaitMs: 5,
        slotCheckIntervalMs: 2,
        slotCheckWindowMs: 100,
        confirmRenderWaitMs: 50
    },

    // 提醒机制
    alert: {
        enableBeep: true,
        enableVibrate: true,
        vibrateDurationMs: 5000
    }
};

// ================= 基础辅助工具 =================

function getFormattedTime() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds(), ms = d.getMilliseconds();
    return (h < 10 ? '0' + h : h) + ":" +
        (m < 10 ? '0' + m : m) + ":" +
        (s < 10 ? '0' + s : s) + "." +
        (ms < 10 ? '00' + ms : (ms < 100 ? '0' + ms : ms));
}

function logInfo(msg) {
    console.log("[INFO] " + getFormattedTime() + " - " + msg);
}

function logDebug(msg) {
    console.verbose("[DEBUG] " + getFormattedTime() + " - " + msg);
}

function logError(msg) {
    console.error("[ERROR] " + getFormattedTime() + " - " + msg);
}

function getTargetTimestamp(timeStr) {
    var parts = timeStr.split(/[:.]/);
    var target = new Date();
    target.setHours(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10),
        parseInt(parts[2], 10),
        parseInt(parts[3] || 0, 10)
    );
    return target.getTime();
}

/**
 * 成功占座后的强提醒机制 (长震动 + 系统原生闹铃)
 * 唤醒人工进行扫脸/密码等合规支付确认
 */
function triggerSuccessAlert() {
    logInfo("🎉 流程占座完成，触发人机协同提醒机制...");

    if (Config.alert.enableBeep) {
        try {
            importClass(android.media.RingtoneManager);
            var uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (!uri) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            var ringtone = RingtoneManager.getRingtone(context, uri);
            if (ringtone) {
                ringtone.play();
                logDebug("已播放系统原生提示音");
            }
        } catch (e) {
            logError("播放铃声失败: " + e);
        }
    }

    if (Config.alert.enableVibrate) {
        var startTime = new Date().getTime();
        while (new Date().getTime() - startTime < Config.alert.vibrateDurationMs) {
            device.vibrate(1000);
            sleep(1050);
        }
    }
}

function triggerFailureAlert() {
    device.vibrate(500);
}

// ================= 核心执行调度 =================

function runScheduleFlow(deviceConfig, scheduleRules) {
    console.show();
    sleep(100);
    logInfo("=== 自动排班任务引擎启动 ===");
    logInfo("当前设备适配型号: " + deviceConfig.device_model);

    // 1. 根据当前星期调度目标人员与时段
    var today = new Date().getDay(); // 0 是周日, 1-6 是周一至周六
    var rule = scheduleRules.weekday_mapping[today.toString()];
    if (!rule || !rule.target_person_key) {
        logInfo("今日 (星期" + today + ") 无需执行自动化任务或处于休眠轮空，脚本退出。");
        return;
    }

    var targetPoint = deviceConfig.person_coordinates[rule.target_person_key];
    if (!targetPoint) {
        logError("未在设备配置中找到目标人员坐标: " + rule.target_person_key);
        triggerFailureAlert();
        return;
    }

    logInfo("今日星期" + today + "，调度目标人员: " + rule.target_person_key + "，时段类型: " + rule.session);

    // 2. 提前拉起目标 App，进入就绪态
    logInfo("拉起目标 App 至前台预热...");
    app.launch(deviceConfig.app_package || Config.appPackageName);
    sleep(1000);

    // 3. 毫秒级极速轮询
    var targetTimestamp = getTargetTimestamp(deviceConfig.interaction_timing.target_start_time || Config.targetStartTime);
    var loopStart = new Date().getTime();
    logInfo("等待目标时刻: " + (deviceConfig.interaction_timing.target_start_time || Config.targetStartTime));

    while (true) {
        var now = new Date().getTime();
        if (now - loopStart > Config.globalTimeoutMs) {
            logError("已达到全局最大超时时间，强制退出。");
            triggerFailureAlert();
            return;
        }
        if (now >= targetTimestamp) {
            logInfo("到达预定时刻 (" + now + ")，毫秒触发核心流程！");
            break;
        }
        sleep(Config.pollIntervalMs);
    }

    // 步骤 1: 点击目标人员进入排班表
    if (!step1SelectPerson(targetPoint, deviceConfig)) {
        logError("第 1 步：点击目标人员失败或未在窗口期内切入排班页。");
        triggerFailureAlert();
        return;
    }

    // 步骤 2: 滑动日期栏至最新放号日期
    step2SwipeDate(deviceConfig);

    // 步骤 3: 选中目标排班日期
    step3SelectDate(today, deviceConfig);

    // 步骤 4: 按优先级遍历号段并切入确认页
    if (!step4SelectTimeSlot(deviceConfig)) {
        logError("第 4 步：所有备选时段均无响应或已被占满，自动回退结束。");
        triggerFailureAlert();
        return;
    }

    // 步骤 5: 最终确认提交并触发人工交接
    if (!step5ConfirmSubmission()) {
        logError("第 5 步：确认提交异常。");
        triggerFailureAlert();
        return;
    }

    logInfo("===========================================");
    logInfo("占座操作成功！请人工确认并完成后续结算。");
    logInfo("===========================================");
    triggerSuccessAlert();
}

/**
 * 步骤 1：点击人员并等待排班页渲染
 */
function step1SelectPerson(point, devConf) {
    var retry = 0;
    while (retry <= 1) {
        logDebug("盲点目标坐标 -> X:" + point[0] + ", Y:" + point[1] + " (尝试第 " + (retry + 1) + " 次)");
        click(point[0], point[1]);
        sleep(devConf.interaction_timing.click_wait_ms);

        var checkStart = new Date().getTime();
        while (new Date().getTime() - checkStart <= Config.timing.checkWindowMs) {
            if (text(Config.markers.schedulePage).exists()) {
                logDebug("成功切入【排班页】，耗时 " + (new Date().getTime() - checkStart) + "ms");
                return true;
            }
            sleep(Config.timing.checkIntervalMs);
        }
        retry++;
    }
    return false;
}

/**
 * 步骤 2：连续滑动手势
 */
function step2SwipeDate(devConf) {
    sleep(devConf.interaction_timing.page_stable_wait_ms);
    var swipeConf = devConf.date_swipe;
    logDebug("开始执行 " + swipeConf.max_count + " 次连续盲滑...");
    for (var i = 0; i < swipeConf.max_count; i++) {
        gesture(
            swipeConf.duration_ms,
            swipeConf.start_point,
            swipeConf.end_point
        );
        sleep(swipeConf.pause_ms);
    }
}

/**
 * 步骤 3：点击最新日期按钮
 */
function step3SelectDate(today, devConf) {
    var targetDatePoint = (today === 6)
        ? devConf.date_target_points.weekend
        : devConf.date_target_points.weekday;

    logDebug("点击目标日期坐标 -> X:" + targetDatePoint[0] + ", Y:" + targetDatePoint[1]);
    click(targetDatePoint[0], targetDatePoint[1]);
    sleep(devConf.interaction_timing.date_refresh_wait_ms);
}

/**
 * 步骤 4：时段轮询与回退
 */
function step4SelectTimeSlot(devConf) {
    var slots = devConf.time_slot_coordinates;
    logDebug("按优先级遍历 " + slots.length + " 个备选时段...");

    for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        logDebug("尝试时段 [" + (i + 1) + "] " + slot.name + " -> " + slot.point[0] + "," + slot.point[1]);
        click(slot.point[0], slot.point[1]);
        sleep(Config.timing.slotClickWaitMs);

        var checkStart = new Date().getTime();
        while (new Date().getTime() - checkStart <= Config.timing.slotCheckWindowMs) {
            if (text(Config.markers.confirmPage).exists()) {
                logDebug("命中有效时段，成功进入【确认页】！检测耗时 " + (new Date().getTime() - checkStart) + "ms");
                return true;
            }
            sleep(Config.timing.slotCheckIntervalMs);
        }
    }
    return false;
}

/**
 * 步骤 5：提交确认
 */
function step5ConfirmSubmission() {
    sleep(Config.timing.confirmRenderWaitMs);
    var confirmBtn = text(Config.markers.confirmButton).findOne(500);
    if (!confirmBtn) {
        logError("未找到确认按钮控件！");
        return false;
    }

    var success = confirmBtn.click();
    if (!success) {
        // 虚拟点击失效时的中心点坐标兜底
        var bounds = confirmBtn.bounds();
        if (bounds) {
            click(bounds.centerX(), bounds.centerY());
        }
    }
    return true;
}

// 导出或全局暴露
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        runScheduleFlow: runScheduleFlow,
        Config: Config
    };
}
