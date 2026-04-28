/**
 * bulk-manage.js
 * Google Ads MCC 脚本 - 自动创建/暂停广告
 *
 * 运行位置: Google Ads MCC 账号 -> 脚本编辑器
 * 触发方式: 每小时定时执行
 *
 * 【无需申请任何 API】这是 Google Ads 内置的 Scripts 功能
 * 登录 Google Ads -> 批量操作 -> 脚本 -> 新建脚本 -> 粘贴本文件
 *
 * 重要限制:
 * - 只支持 ES5 语法 (var, function, 不能用 let/const/箭头函数/async)
 * - 使用 Google Ads Script 内置的 AdsApp API
 */

// ===== 配置（填入你的 Sheets 信息） =====
var CONFIG = {
  SPREADSHEET_ID: '1fj8-4sb3x7uo4N-R8WCTB9UivtjNdadg0n7Qi1cZ6Lk',
  BULK_TAB: '批量投放',
  HISTORY_TAB: 'offer历史总表',
};

// Google Ads 地理位置 ID 映射（国家代码 -> Geo ID）
var GEO_ID_MAP = {
  'US': 2840, 'GB': 2826, 'AU': 2036, 'CA': 2258, 'DE': 2276,
  'FR': 2250, 'JP': 2156, 'BR': 2076, 'IN': 2156, 'ES': 2724,
  'IT': 2700, 'NL': 2704, 'MX': 2424, 'AR': 2072, 'SE': 2758,
  'NO': 2740, 'DK': 2208, 'FI': 2212, 'PL': 2344, 'CH': 2784,
  'AT': 2764, 'BE': 2060, 'IE': 2748, 'NZ': 2710, 'SG': 2812,
  'HK': 2150, 'ZA': 2068, 'AE': 2822, 'SA': 2762, 'IL': 2946,
};

// 国家 -> 语言映射
var LANGUAGE_MAP = {
  'US': 1000, 'GB': 1000, 'AU': 1000, 'CA': 1000, 'IE': 1000,
  'NZ': 1000, 'SG': 1000, 'HK': 1000,
  'IN': 1003,
  'DE': 2826, 'AT': 2826, 'CH': 2826,
  'FR': 2250, 'BE': 2250,
  'ES': 3082, 'MX': 3082,
  'IT': 2700,
  'PT': 1046, 'BR': 1046,
  'JP': 2096,
  'KR': 2112,
  'NL': 2716,
  'PL': 2074,
  'RU': 1049,
  'SE': 2810,
  'NO': 2798,
  'DK': 2204,
  'FI': 2212,
  'AR': 2005,
  'IL': 2966,
  'SA': 2994,
  'AE': 2898,
  'ZA': 2076,
};

function main() {
  var sheetConfig = connectSheets();
  var rows = getRowsByStatus(sheetConfig, 'create');
  var created = 0;

  // 遍历所有 create 状态的行
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowIndex = row.rowIndex;
    var data = row.data;

    // A:账号ID, B:官网, C:广告系列名称, D:商家名称, E:商家ID, F:联盟链接, G:联盟名称, H:国家, I:状态, J:URL后缀, K:关键词, L:广告标题, M:广告描述, N:预算
    var accountId = data[0];      // A: CID
    var website = data[1];        // B: website (落地页)
    var campaignName = data[2];   // C: campaign name
    var merchantName = data[3];   // D: 商家名称
    var merchantId = data[4];     // E: 商家ID
    var trackingUrl = data[5];    // F: 联盟追踪链接
    var affiliateName = data[6];  // G: 联盟名称
    var country = data[7];         // H: 国家
    var status = data[8];         // I: 状态
    var urlSuffix = data[9];      // J: URL后缀
    var keywords = data[10];      // K: 关键词
    var titles = data[11];        // L: 广告标题
    var descriptions = data[12]; // M: 广告描述
    var budget = parseFloat(data[13]) || 1.5; // N: 预算

    if (!accountId || !trackingUrl) {
      updateRowStatus(sheetConfig, rowIndex, 'error', 'Missing account ID or tracking URL');
      continue;
    }

    if (!campaignName || !titles || !descriptions) {
      updateRowStatus(sheetConfig, rowIndex, 'error', 'Missing campaign data');
      continue;
    }

    try {
      // 切换到子账号
      var account = AdsApp.accounts()
        .withIds([accountId])
        .get()
        .next();

      AdsApp.currentAccount(account);

      // 创建广告系列
      var campaign = createCampaign(campaignName, budget);
      var adGroup = createAdGroup(campaign, website);

      // 创建关键词
      if (keywords) {
        var kwList = keywords.split(',').slice(0, 5);
        for (var ki = 0; ki < kwList.length; ki++) {
          createKeyword(adGroup, kwList[ki].trim());
        }
      }

      // 设置设备出价（电脑/平板降 90%）
      setDeviceBidding(campaign);

      // 设置国家和语言定向
      setLocationAndLanguage(campaign, country);

      // 创建 RSA 广告（使用追踪链接）
      createRSAd(adGroup, titles, descriptions, trackingUrl, urlSuffix);

      // 激活广告
      campaign.status('ENABLED');

      updateRowStatus(sheetConfig, rowIndex, 'success', 'Campaign ID: ' + campaign.getId());
      Logger.log('Created: ' + campaignName);
      created++;

    } catch (e) {
      var errMsg = e.message || String(e);
      updateRowStatus(sheetConfig, rowIndex, 'error', errMsg);
      Logger.log('ERROR row ' + rowIndex + ': ' + errMsg);
    }
  }

  // 处理 pause 状态 -> 暂停广告
  var pauseRows = getRowsByStatus(sheetConfig, 'pause');
  for (var pi = 0; pi < pauseRows.length; pi++) {
    var prow = pauseRows[pi];
    var pdata = prow.data;
    var pAccountId = pdata[0];
    var pCampaignName = pdata[2];

    try {
      var pAccount = AdsApp.accounts()
        .withIds([pAccountId])
        .get()
        .next();

      AdsApp.currentAccount(pAccount);

      var campaigns = AdsApp.campaigns()
        .withCondition('Name = "' + pCampaignName + '"')
        .get();

      if (campaigns.hasNext()) {
        var pCampaign = campaigns.next();
        pCampaign.pause();
        updateRowStatus(sheetConfig, prow.rowIndex, 'success', 'Paused');
        moveRowToHistory(sheetConfig, prow.rowIndex);
        Logger.log('Paused: ' + pCampaignName);
      }
    } catch (e) {
      Logger.log('Pause error: ' + e.message);
    }
  }

  Logger.log('Done! Created: ' + created + ', Paused: ' + pauseRows.length);
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'bulk-manage Report',
    'Created: ' + created + ', Paused: ' + pauseRows.length);
}

function createCampaign(name, budget) {
  var budgetOperation = AdsApp.newBudgetBuilder()
    .withName(name + '-budget')
    .withBudgetAmount(budget * 1000000)
    .withDeliveryMethod('STANDARD')
    .build();

  var budgetResource = budgetOperation.getResult();

  var campaignBuilder = AdsApp.newCampaignBuilder()
    .withName(name)
    .withBudget(budgetResource)
    .withStatus('PAUSED')
    .withCampaignType('SEARCH')
    .build();

  return campaignBuilder.getResult();
}

function createAdGroup(campaign, website) {
  var adGroupBuilder = campaign.newAdGroupBuilder()
    .withName(website)
    .withStatus('ENABLED')
    .build();

  return adGroupBuilder.getResult();
}

function createKeyword(adGroup, keyword) {
  adGroup.newKeywordBuilder()
    .withKeyword(keyword)
    .withMatchType('BROAD')
    .build();
}

function setDeviceBidding(campaign) {
  var devicePlatforms = campaign.targeting().platforms().get();
  while (devicePlatforms.hasNext()) {
    var platform = devicePlatforms.next();
    if (platform.getPlatformType() === 'DESKTOP' || platform.getPlatformType() === 'TABLET') {
      platform.bidding().setBidModifier(0.1);
    }
  }
}

function setLocationAndLanguage(campaign, country) {
  var geoId = GEO_ID_MAP[country] || 2840;
  var langId = LANGUAGE_MAP[country] || 1000;

  campaign.addLocation(geoId, 0);
  campaign.addLanguage(langId);
}

function createRSAd(adGroup, titlesRaw, descriptionsRaw, finalUrl, urlSuffix) {
  var titles = titlesRaw.split('\n').slice(0, 15);
  var descriptions = descriptionsRaw.split('\n').slice(0, 4);

  if (titles.length < 3 || descriptions.length < 2) {
    throw new Error('Need at least 3 titles and 2 descriptions');
  }

  var adBuilder = AdsApp.newAdGroupAdBuilder()
    .withAd(
      AdsApp.newExpandedTextAdBuilder()
        .withHeadlines(titles)
        .withDescriptions(descriptions)
        .withPath1('products')
        .withPath2('deals')
        .withFinalUrl(finalUrl)
    );

  if (urlSuffix) {
    adBuilder.withFinalUrlSuffix(urlSuffix);
  }

  adBuilder.build();
}

function connectSheets() {
  return {
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    token: ScriptApp.getOAuthToken(),
  };
}

function getRowsByStatus(sheetConfig, status) {
  var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetConfig.spreadsheetId +
    '/values/' + encodeURIComponent(CONFIG.BULK_TAB) + '!A:N';

  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + sheetConfig.token },
    muteHttpExceptions: true,
  });

  var data = JSON.parse(response.getContentText());
  var rows = data.values || [];
  var results = [];

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][8] === status) {
      results.push({ rowIndex: i + 1, data: rows[i] });
    }
  }

  return results;
}

// 更新 I 列状态和 P 列备注
function updateRowStatus(sheetConfig, rowIndex, status, notes) {
  var statusCell = CONFIG.BULK_TAB + '!I' + rowIndex;
  var notesCell = CONFIG.BULK_TAB + '!P' + rowIndex;

  // 更新状态 (I列)
  UrlFetchApp.fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + sheetConfig.spreadsheetId +
    '/values/' + encodeURIComponent(statusCell) + '?valueInputOption=RAW',
    {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + sheetConfig.token,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ values: [[status]] }),
      muteHttpExceptions: true,
    }
  );

  // 更新备注 (P列)
  if (notes) {
    UrlFetchApp.fetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + sheetConfig.spreadsheetId +
      '/values/' + encodeURIComponent(notesCell) + '?valueInputOption=RAW',
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + sheetConfig.token,
          'Content-Type': 'application/json',
        },
        payload: JSON.stringify({ values: [[notes]] }),
        muteHttpExceptions: true,
      }
    );
  }
}

function moveRowToHistory(sheetConfig, rowIndex) {
  var range = CONFIG.BULK_TAB + '!A' + rowIndex + ':N' + rowIndex;
  var response = UrlFetchApp.fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + sheetConfig.spreadsheetId +
    '/values/' + encodeURIComponent(range),
    {
      headers: { Authorization: 'Bearer ' + sheetConfig.token },
      muteHttpExceptions: true,
    }
  );

  var data = JSON.parse(response.getContentText());
  var rowData = (data.values || [[]])[0] || [];

  var historyResponse = UrlFetchApp.fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + sheetConfig.spreadsheetId +
    '/values/' + encodeURIComponent(CONFIG.HISTORY_TAB) + '!A:A',
    {
      headers: { Authorization: 'Bearer ' + sheetConfig.token },
      muteHttpExceptions: true,
    }
  );

  var historyData = JSON.parse(historyResponse.getContentText());
  var historyRow = (historyData.values || []).length + 1;
  var historyRange = CONFIG.HISTORY_TAB + '!A' + historyRow + ':N' + historyRow;

  UrlFetchApp.fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + sheetConfig.spreadsheetId +
    '/values/' + encodeURIComponent(historyRange) + '?valueInputOption=RAW',
    {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + sheetConfig.token,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ values: [rowData] }),
      muteHttpExceptions: true,
    }
  );

  UrlFetchApp.fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + sheetConfig.spreadsheetId +
    '/values/' + encodeURIComponent(range) + '?valueInputOption=RAW',
    {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + sheetConfig.token,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ values: [[]] }),
      muteHttpExceptions: true,
    }
  );
}
