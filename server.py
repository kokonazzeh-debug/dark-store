# -*- coding: utf-8 -*-
"""
𝑫𝑨𝑹𝑲 𝑺𝑻Ø𝑹𝑬 — Backend Server
================================
تشغيل:  python server.py
ثم افتح المتصفح على: http://localhost:8000
لوحة التحكم: http://localhost:8000/admin
"""
import http.server
import socketserver
import json
import os
import hashlib
import secrets
import urllib.parse
import datetime
import base64
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
PORT = int(os.environ.get('PORT', 8000))

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# كلمات مرور الجلسات الصالحة
TOKENS = set()


# ---------- مساعدات ملفات JSON ----------
def default_admin():
    return {
        "username": "admin",
        "passwordHash": "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"
    }


def default_payments():
    return {
        "vodafone": "01204733638",
        "orange": "01204733638",
        "instapay": "01204733638",
        "note": "يرجى إرسال إيصال التحويل مع اسم اللعبة والـ ID في الرسالة"
    }


def default_orders():
    return {"orders": []}


def load_json(name, default):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        save_json(name, default)
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save_json(name, data):
    path = os.path.join(DATA_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------- المساعدات ----------
def is_authenticated(handler):
    auth = handler.headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()
    return token in TOKENS


def read_body(handler):
    length = int(handler.headers.get('Content-Length') or 0)
    return handler.rfile.read(length) if length else b''


def gen_order_id():
    return 'ORD-' + datetime.datetime.now().strftime('%Y%m%d%H%M%S')


# ---------- الخادم ----------
class StoreHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass

    # ---- أدوات استجابة ----
    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def send_text(self, code, text, content_type='text/plain; charset=utf-8'):
        data = text.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def serve_static(self, rel_path):
        full = os.path.realpath(os.path.join(BASE_DIR, rel_path))
        if not full.startswith(os.path.realpath(BASE_DIR)):
            self.send_error(403)
            return
        if not os.path.isfile(full):
            self.send_error(404)
            return
        ext = os.path.splitext(full)[1].lower()
        mime = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.woff2': 'font/woff2',
        }.get(ext, 'application/octet-stream')
        with open(full, 'rb') as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)

    # ---- CORS ----
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Length', '0')
        self.end_headers()

    # ---- GET ----
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # لوحة التحكم
        if path.startswith('/admin'):
            rel = path[len('/admin'):].lstrip('/')
            if not rel:
                rel = 'index.html'
            self.serve_static(os.path.join('admin', rel))
            return

        # بيانات عامة
        if path == '/data/products.json':
            self.serve_static('data/products.json')
            return
        if path == '/api/payments':
            self.send_json(200, load_json('payments.json', default_payments()))
            return
        if path == '/api/orders':
            self.send_json(200, load_json('orders.json', default_orders()))
            return

        # ملفات مرفوعة
        if path.startswith('/uploads/'):
            self.serve_static(path.lstrip('/'))
            return

        # الصفحة الرئيسية والملفات
        if path in ('/', '/index.html'):
            self.serve_static('index.html')
            return

        self.serve_static(path.lstrip('/'))

    # ---- POST ----
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            body = read_body(self)
            payload = json.loads(body) if body else {}
        except Exception:
            self.send_json(400, {"error": "بيانات غير صالحة"})
            return

        # تسجيل الدخول
        if path == '/api/login':
            admin = load_json('admin.json', default_admin())
            password = str(payload.get('password', ''))
            h = hashlib.sha256(password.encode('utf-8')).hexdigest()
            if payload.get('username') == admin['username'] and h == admin['passwordHash']:
                token = secrets.token_hex(16)
                TOKENS.add(token)
                self.send_json(200, {"token": token, "username": admin['username']})
            else:
                self.send_json(401, {"error": "اسم المستخدم أو كلمة المرور غير صحيحة"})
            return

        # تسجيل الخروج
        if path == '/api/logout':
            auth = self.headers.get('Authorization', '')
            TOKENS.discard(auth.replace('Bearer ', '').strip())
            self.send_json(200, {"ok": True})
            return

        # إنشاء طلب (من العميل - بدون تسجيل دخول)
        if path == '/api/orders':
            orders = load_json('orders.json', default_orders())
            order_id = gen_order_id()
            receipt_path = ''
            img_b64 = payload.get('receiptImage', '')
            if img_b64:
                try:
                    if ',' in img_b64:
                        header, img_b64 = img_b64.split(',', 1)
                    img_bytes = base64.b64decode(img_b64)
                    ext = '.png'
                    receipt_path = 'uploads/' + order_id + ext
                    with open(os.path.join(BASE_DIR, receipt_path), 'wb') as f:
                        f.write(img_bytes)
                except Exception:
                    receipt_path = ''

            order = {
                "id": order_id,
                "date": datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
                "customerName": str(payload.get('customerName', '')),
                "phone": str(payload.get('phone', '')),
                "gameId": str(payload.get('gameId', '')),
                "gameName": str(payload.get('gameName', '')),
                "product": str(payload.get('product', '')),
                "amount": payload.get('amount', 0),
                "paymentMethod": str(payload.get('paymentMethod', '')),
                "receiptImage": receipt_path,
                "status": "pending"
            }
            orders['orders'].insert(0, order)
            save_json('orders.json', orders)
            self.send_json(200, {"ok": True, "id": order_id})
            return

        # حفظ بيانات الألعاب والأسعار (أدمن فقط)
        if path == '/api/games':
            if not is_authenticated(self):
                self.send_json(401, {"error": "غير مصرح — سجّل الدخول أولاً"})
                return
            games = payload.get('games')
            services = payload.get('services')
            if games is None:
                self.send_json(400, {"error": "البيانات غير مكتملة"})
                return
            products_path = os.path.join(DATA_DIR, 'products.json')
            try:
                with open(products_path, 'r', encoding='utf-8') as f:
                    current = json.load(f)
            except Exception:
                current = {}
            current['games'] = games
            if services is not None:
                current['services'] = services
            save_json('products.json', current)
            self.send_json(200, {"ok": True})
            return

        # حفظ أرقام الدفع (أدمن فقط)
        if path == '/api/payments':
            if not is_authenticated(self):
                self.send_json(401, {"error": "غير مصرح — سجّل الدخول أولاً"})
                return
            data = {
                "vodafone": str(payload.get('vodafone', '')),
                "orange": str(payload.get('orange', '')),
                "instapay": str(payload.get('instapay', '')),
                "note": str(payload.get('note', ''))
            }
            save_json('payments.json', data)
            self.send_json(200, {"ok": True, "payments": data})
            return

        self.send_error(404)

    # ---- PATCH (تعديل حالة الطلب) ----
    def do_PATCH(self):
        if not is_authenticated(self):
            self.send_json(401, {"error": "غير مصرح — سجّل الدخول أولاً"})
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/orders/'):
            order_id = path.split('/')[-1]
            try:
                body = read_body(self)
                payload = json.loads(body) if body else {}
            except Exception:
                self.send_json(400, {"error": "بيانات غير صالحة"})
                return
            orders = load_json('orders.json', default_orders())
            for o in orders['orders']:
                if o['id'] == order_id:
                    if payload.get('status') in ('pending', 'shipped', 'cancelled'):
                        o['status'] = payload['status']
                        save_json('orders.json', orders)
                        self.send_json(200, {"ok": True, "order": o})
                        return
                    else:
                        self.send_json(400, {"error": "حالة غير صالحة"})
                        return
            self.send_json(404, {"error": "الطلب غير موجود"})
            return
        self.send_error(404)

    # ---- DELETE (حذف طلب) ----
    def do_DELETE(self):
        if not is_authenticated(self):
            self.send_json(401, {"error": "غير مصرح — سجّل الدخول أولاً"})
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/orders/'):
            order_id = path.split('/')[-1]
            orders = load_json('orders.json', default_orders())
            orders['orders'] = [o for o in orders['orders'] if o['id'] != order_id]
            save_json('orders.json', orders)
            self.send_json(200, {"ok": True})
            return
        self.send_error(404)


ThreadingHTTPServer = socketserver.ThreadingTCPServer


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def run():
    # تجهيز الملفات الافتراضية
    load_json('admin.json', default_admin())
    load_json('payments.json', default_payments())
    load_json('orders.json', default_orders())

    print("=" * 50)
    print("  𝑫𝑨𝑹𝑲 𝑺𝑻Ø𝑹𝑬 Backend Server")
    print("=" * 50)
    print(f"  الموقع:      http://localhost:{PORT}")
    print(f"  لوحة التحكم: http://localhost:{PORT}/admin")
    print(f"  بيانات:      {DATA_DIR}")
    print("=" * 50)
    try:
        with Server(('0.0.0.0', PORT), StoreHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nتم إيقاف الخادم.")


if __name__ == '__main__':
    run()
