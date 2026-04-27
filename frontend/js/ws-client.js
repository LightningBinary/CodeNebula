/**
 * CodeNebula - WebSocket 客户端
 * 事件驱动的实时通信
 */

export class WebSocketClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectDelay = 3000;
        this.maxReconnectAttempts = 10;
        this.reconnectAttempts = 0;
        
        // 事件处理器
        this.handlers = {
            connected: [],
            disconnected: [],
            error: [],
            event: []
        };
    }

    connect() {
        try {
            this.ws = new WebSocket(this.url);
            
            this.ws.onopen = () => {
                console.log('🔌 WebSocket 连接成功');
                this.reconnectAttempts = 0;
                this.emit('connected');

                // 连接成功后请求当前状态
                setTimeout(() => {
                    this.send({ type: 'get_state' });
                    console.log('📡 已发送 get_state 请求');
                }, 100);
            };

            this.ws.onclose = () => {
                console.log('🔌 WebSocket 断开');
                this.emit('disconnected');
                this.scheduleReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('❌ WebSocket 错误:', error);
                this.emit('error', error);
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[WS] Received:', data.type, data);
                    this.emit('event', data);
                } catch (e) {
                    console.error('❌ 解析消息失败:', e);
                }
            };
            
        } catch (error) {
            console.error('❌ 创建 WebSocket 失败:', error);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('⚠️ 达到最大重连次数');
            return;
        }

        this.reconnectAttempts++;
        console.log(`⏳ ${this.reconnectDelay / 1000}s 后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => this.connect(), this.reconnectDelay);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    on(event, handler) {
        if (this.handlers[event]) {
            this.handlers[event].push(handler);
        }
    }

    off(event, handler) {
        if (this.handlers[event]) {
            const index = this.handlers[event].indexOf(handler);
            if (index > -1) {
                this.handlers[event].splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.handlers[event]) {
            this.handlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (e) {
                    console.error(`❌ 事件处理错误 (${event}):`, e);
                }
            });
        }
    }
}
