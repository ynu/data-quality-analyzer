const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const axios = require('axios');

// 加载配置文件
let CONFIG;
try {
  // 尝试加载用户配置文件
  CONFIG = require('./config.js');
  console.log('已加载用户配置文件 config.js');
} catch (error) {
  // 如果用户配置文件不存在，使用默认配置
  console.log('未找到 config.js，使用默认配置');
  CONFIG = {
    // 请替换为实际的API密钥（用于HTTP请求头认证）
    API_KEY: 'your_api_key_here',
    // 应用标识（请求体中使用，值应与API_KEY相同）
    APP_KEY: 'your_api_key_here',
    API_BASE_URL: 'https://agent.ynu.edu.cn/api/proxy/api/v1',
    INPUT_FILE: 'input.csv',
    OUTPUT_FILE: 'output.csv',
    API_DELAY: 1000,
    MAX_ROWS_PER_BATCH: 100,
    VERBOSE_LOGGING: true,
    // 用户ID（用于API请求中的UserID字段）
    // 可以使用占位符 {index} 会在处理时替换为当前行号
    USER_ID: 'user_{index}',
    // 查询文本（用于API请求中的Query字段）
    // 可以使用占位符 {fieldName} 和 {tableName} 会在处理时替换为当前字段名和表名
    QUERY: '**注意**：修正前面要的要求，现在你只需要输出Observation下面Output的数据即可，原样输出，不需要任何改动或添加任何字符！！！'
  };
}

// 智能体API客户端类
class AgentAPIClient {
  constructor(apiKey, appKey, baseUrl) {
    this.apiKey = apiKey; // 用于HTTP请求头认证的ApiKey
    this.appKey = appKey; // 用于请求体的AppKey，值应与ApiKey相同
    this.baseUrl = baseUrl;
    this.conversationId = null;
  }

  // 创建会话
  async createConversation(userId, tableName = null, fieldName = null) {
    const url = `${this.baseUrl}/create_conversation`;
    const requestData = {
      UserID: userId
    };
    
    // 如果提供了tableName和fieldName，添加到Inputs中
    if (tableName && fieldName) {
      requestData.Inputs = {
        table_name: tableName,
        field_name: fieldName
      };
    }
    const requestHeaders = {
      'Apikey': this.apiKey,
      'AppKey': this.appKey,
      'Content-Type': 'application/json'
    };

    if (CONFIG.VERBOSE_LOGGING) {
      console.log('\n=== 创建会话调试信息 ===');
      console.log('请求URL:', url);
      console.log('请求方法: POST');
      console.log('请求头:', JSON.stringify(requestHeaders, null, 2));
      console.log('请求体:', JSON.stringify(requestData, null, 2));
    }

    try {
      const response = await axios.post(url, requestData, {
        headers: requestHeaders,
        timeout: 30000
      });

      if (CONFIG.VERBOSE_LOGGING) {
        console.log('响应状态码:', response.status);
        console.log('响应头:', JSON.stringify(response.headers, null, 2));
        console.log('响应数据:', JSON.stringify(response.data, null, 2));
      }

      if (response.data && response.data.Conversation) {
        this.conversationId = response.data.Conversation.AppConversationID;
        console.log(`✅ 会话创建成功，会话ID: ${this.conversationId}`);
        return this.conversationId;
      } else {
        throw new Error('创建会话失败：响应格式不正确');
      }
    } catch (error) {
      console.error('\n❌ 创建会话失败:');
      
      if (error.response) {
        // 服务器响应了错误状态码
        console.error('状态码:', error.response.status);
        console.error('响应头:', JSON.stringify(error.response.headers, null, 2));
        console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
        
        // 根据状态码提供具体的错误信息
        switch (error.response.status) {
          case 404:
            console.error('\n💡 404错误可能原因：');
            console.error('   1. API端点路径不正确');
            console.error('   2. 智能体未发布或API访问未开启');
            console.error('   3. API密钥无效或权限不足');
            console.error('   4. 服务暂时不可用');
            break;
          case 401:
            console.error('\n💡 401错误可能原因：');
            console.error('   1. API密钥无效或已过期');
            console.error('   2. 认证方式不正确');
            break;
          case 403:
            console.error('\n💡 403错误可能原因：');
            console.error('   1. API密钥权限不足');
            console.error('   2. 智能体访问被限制');
            break;
          case 500:
            console.error('\n💡 500错误可能原因：');
            console.error('   1. 服务器内部错误');
            console.error('   2. 请求格式不正确');
            break;
        }
      } else if (error.request) {
        // 请求已发出但没有收到响应
        console.error('无响应:', error.message);
        console.error('💡 可能原因：网络连接问题或服务器不可达');
      } else {
        // 设置请求时发生错误
        console.error('请求设置错误:', error.message);
      }
      
      throw error;
    }
  }

  // 发送消息到智能体
  async sendMessage(query, userId, tableName = null, fieldName = null) {
    try {
      // 每次调用都创建新的会话，确保每行数据使用独立的会话ID
      await this.createConversation(userId, tableName, fieldName);

      const url = `${this.baseUrl}/chat_query_v2`;
      const requestData = {
        AppConversationID: this.conversationId,
        Query: query,
        UserID: userId,
        ResponseMode: 'blocking' // 使用阻塞模式，等待完整响应
      };
      const requestHeaders = {
        'Apikey': this.apiKey,
        'AppKey': this.appKey,
        'Content-Type': 'application/json'
      };

      if (CONFIG.VERBOSE_LOGGING) {
        console.log('\n=== 发送消息调试信息 ===');
        console.log('请求URL:', url);
        console.log('请求方法: POST');
        console.log('请求头:', JSON.stringify(requestHeaders, null, 2));
        console.log('请求体:', JSON.stringify(requestData, null, 2));
      }

      const response = await axios.post(url, requestData, {
        headers: requestHeaders,
        timeout: 60000 // 聊天响应可能需要更长时间
      });

      if (CONFIG.VERBOSE_LOGGING) {
        console.log('响应状态码:', response.status);
        console.log('响应数据:', JSON.stringify(response.data, null, 2));
      }

      return response.data;
    } catch (error) {
      console.error('\n❌ 发送消息失败:', error.message);
      
      if (error.response) {
        console.error('状态码:', error.response.status);
        console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      }
      
      throw error;
    }
  }
}

// CSV处理器类
class CSVProcessor {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.results = [];
    this.successfulRows = new Set(); // 存储已成功处理的行的唯一标识
    this.failedRows = []; // 存储失败的原始数据
  }

  // 读取CSV文件
  async readCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          results.push(data);
        })
        .on('end', () => {
          console.log(`CSV文件读取完成，共读取 ${results.length} 行数据`);
          resolve(results);
        })
        .on('error', (error) => {
          console.error('读取CSV文件失败:', error.message);
          reject(error);
        });
    });
  }

  // 读取已成功处理的数据
  async readSuccessfulData() {
    const successFile = 'success_input.csv';
    if (!fs.existsSync(successFile)) {
      console.log('未找到success_input.csv文件，将创建新文件');
      return;
    }

    try {
      const successfulData = await this.readCSV(successFile);
      // 使用字段名称和所属表作为唯一标识
      successfulData.forEach(row => {
        const key = `${row['字段名称']}_${row['所属表']}`;
        this.successfulRows.add(key);
      });
      console.log(`已加载 ${this.successfulRows.size} 条已成功处理的记录`);
    } catch (error) {
      console.error('读取success_input.csv失败:', error.message);
    }
  }

  // 保存成功处理的数据
  async saveSuccessfulData(row) {
    const successFile = 'success_input.csv';
    const csvWriter = createCsvWriter({
      path: successFile,
      header: [
        { id: '字段名称', title: '字段名称' },
        { id: '所属表', title: '所属表' },
        { id: '名称', title: '名称' },
        { id: '类型', title: '类型' },
        { id: '长度', title: '长度' },
        { id: '主键', title: '主键' },
        { id: '责任部门', title: '责任部门' },
        { id: '质量检查规则', title: '质量检查规则' },
        { id: '类别', title: '类别' },
        { id: '所属类别', title: '所属类别' }
      ],
      append: fs.existsSync(successFile) // 如果文件存在则追加，否则创建新文件
    });

    try {
      await csvWriter.writeRecords([row]);
    } catch (error) {
      console.error('保存成功数据失败:', error.message);
    }
  }

  // 保存失败的数据
  async saveFailedData(row, reason) {
    this.failedRows.push({
      ...row,
      失败原因: reason
    });
  }

  // 将所有失败数据写入failed_input.csv
  async writeFailedData() {
    if (this.failedRows.length === 0) {
      console.log('没有失败数据需要保存');
      return;
    }

    const csvWriter = createCsvWriter({
      path: 'failed_input.csv',
      header: [
        { id: '字段名称', title: '字段名称' },
        { id: '所属表', title: '所属表' },
        { id: '名称', title: '名称' },
        { id: '类型', title: '类型' },
        { id: '长度', title: '长度' },
        { id: '主键', title: '主键' },
        { id: '责任部门', title: '责任部门' },
        { id: '质量检查规则', title: '质量检查规则' },
        { id: '类别', title: '类别' },
        { id: '所属类别', title: '所属类别' },
        { id: '失败原因', title: '失败原因' }
      ]
    });

    try {
      await csvWriter.writeRecords(this.failedRows);
      console.log(`失败数据已保存到 failed_input.csv，共 ${this.failedRows.length} 条记录`);
    } catch (error) {
      console.error('保存失败数据失败:', error.message);
    }
  }

  // 处理数据行
  async processData(dataRows) {
    console.log(`开始处理数据，共 ${dataRows.length} 行...`);
    
    // 先读取已成功处理的数据
    await this.readSuccessfulData();
    
    // 分批处理数据
    const batchSize = CONFIG.MAX_ROWS_PER_BATCH || 100;
    let processedCount = 0;
    let skippedCount = 0;
    
    for (let batchStart = 0; batchStart < dataRows.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, dataRows.length);
      const batch = dataRows.slice(batchStart, batchEnd);
      
      console.log(`正在处理第 ${batchStart + 1}-${batchEnd} 行（批次 ${Math.floor(batchStart / batchSize) + 1}）`);
      
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const globalIndex = batchStart + i;
        
        // 提取字段名称和所属表
        const fieldName = row['字段名称'];
        const tableName = row['所属表'];
        
        if (!fieldName || !tableName) {
          console.warn(`第 ${globalIndex + 2} 行数据不完整，跳过处理`);
          continue;
        }

        // 检查是否已经处理过这条数据
        const rowKey = `${fieldName}_${tableName}`;
        if (this.successfulRows.has(rowKey)) {
          console.log(`第 ${globalIndex + 2} 行 (${fieldName} - ${tableName}) 已处理过，跳过`);
          skippedCount++;
          continue;
        }

        try {
          // 构造查询文本
          // 使用配置中的QUERY，并替换占位符
          let queryText = CONFIG.QUERY;
          queryText = queryText.replace('{fieldName}', fieldName);
          queryText = queryText.replace('{tableName}', tableName);
          
          if (CONFIG.VERBOSE_LOGGING) {
            console.log(`正在处理第 ${globalIndex + 2} 行: ${fieldName} - ${tableName}`);
          }
          
          // 调用智能体API
          // 使用配置中的USER_ID，并替换{index}占位符为当前行号
          const userId = CONFIG.USER_ID.replace('{index}', globalIndex + 1);
          const response = await this.apiClient.sendMessage(queryText, userId, tableName, fieldName);
          
          // 解析API返回的answer字段
          let answerData = [];
          let parseSuccess = false;
          
          if (response && response.answer) {
            try {
              // 如果answer是字符串，尝试解析为JSON
              if (typeof response.answer === 'string') {
                answerData = JSON.parse(response.answer);
              } else if (Array.isArray(response.answer)) {
                answerData = response.answer;
              }
              
              // 验证answerData是否为数组
              if (Array.isArray(answerData)) {
                parseSuccess = true;
              } else {
                console.warn(`第 ${globalIndex + 2} 行: answer字段不是数组格式`);
              }
            } catch (parseError) {
              console.error(`第 ${globalIndex + 2} 行: 解析answer字段失败:`, parseError.message);
            }
          }
          
          // 根据解析结果处理数据
          if (parseSuccess && answerData.length > 0) {
            // 解析成功，将answer数组中的每个对象添加到结果中
            answerData.forEach(item => {
              this.results.push({
                table_name: item.table_name || tableName,
                field_name: item.field_name || fieldName,
                维度: item.维度 || '',
                备注: item.备注 || ''
              });
            });
            
            // 保存成功处理的数据
            await this.saveSuccessfulData(row);
            this.successfulRows.add(rowKey);
            processedCount++;
            
            // 立即保存当前结果到output.csv
            await this.saveResults(CONFIG.OUTPUT_FILE);
            
            if (CONFIG.VERBOSE_LOGGING) {
              console.log(`第 ${globalIndex + 2} 行处理完成，获取到 ${answerData.length} 条数据，已保存到 ${CONFIG.OUTPUT_FILE}`);
            }
          } else {
            // 解析失败，保存到失败列表
            const reason = parseSuccess ? 'answer字段为空数组' : 'answer字段不是有效的JSON数组';
            console.warn(`第 ${globalIndex + 2} 行: ${reason}`);
            await this.saveFailedData(row, reason);
          }
          
          // 添加延迟，避免API调用过于频繁
          await this.sleep(CONFIG.API_DELAY || 1000);
          
        } catch (error) {
          console.error(`处理第 ${globalIndex + 2} 行时出错:`, error.message);
          
          // 保存到失败列表
          await this.saveFailedData(row, `API调用错误: ${error.message}`);
        }
      }
      
      // 批次完成提示（由于每行都已保存，这里不再需要保存中间结果）
      if (batchEnd < dataRows.length) {
        console.log(`批次完成，已处理 ${processedCount} 行，数据已实时保存`);
      }
    }
    
    // 保存所有失败数据
    await this.writeFailedData();
    
    console.log(`数据处理完成，共处理 ${processedCount} 行，跳过 ${skippedCount} 行，生成 ${this.results.length} 条记录`);
  }

  // 保存结果到CSV
  async saveResults(filePath) {
    if (this.results.length === 0) {
      console.log('没有结果需要保存');
      return;
    }

    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'table_name', title: 'table_name' },
        { id: 'field_name', title: 'field_name' },
        { id: '维度', title: '维度' },
        { id: '备注', title: '备注' }
      ]
    });

    try {
      await csvWriter.writeRecords(this.results);
      console.log(`结果已保存到 ${filePath}，共 ${this.results.length} 条记录`);
    } catch (error) {
      console.error('保存结果失败:', error.message);
      throw error;
    }
  }

  // 延迟函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 主函数
async function main() {
  try {
    console.log('开始执行CSV数据处理程序...');
    console.log(`配置信息: 输入文件=${CONFIG.INPUT_FILE}, 输出文件=${CONFIG.OUTPUT_FILE}`);
    console.log(`API设置: 延迟=${CONFIG.API_DELAY}ms, 批次大小=${CONFIG.MAX_ROWS_PER_BATCH}`);
    
    // 检查API密钥是否已配置
    if (CONFIG.API_KEY === 'your_api_key_here') {
      console.error('错误：请在CONFIG中设置正确的API_KEY');
      console.error('提示：可以复制 config.example.js 为 config.js 并填入实际配置');
      process.exit(1);
    }

    // 检查输入文件是否存在
    if (!fs.existsSync(CONFIG.INPUT_FILE)) {
      console.error(`错误：输入文件 ${CONFIG.INPUT_FILE} 不存在`);
      process.exit(1);
    }

    // 初始化API客户端
    const apiClient = new AgentAPIClient(CONFIG.API_KEY, CONFIG.APP_KEY, CONFIG.API_BASE_URL);
    
    // 初始化CSV处理器
    const processor = new CSVProcessor(apiClient);
    
    // 读取CSV文件
    const dataRows = await processor.readCSV(CONFIG.INPUT_FILE);
    
    // 处理数据
    await processor.processData(dataRows);
    
    // 保存结果
    await processor.saveResults(CONFIG.OUTPUT_FILE);
    
    console.log('程序执行完成！');
    
  } catch (error) {
    console.error('程序执行出错:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main();