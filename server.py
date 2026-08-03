# -*- coding: utf-8 -*-
"""
𝑫𝑨𝑹𝑲 𝑺𝑻Ø𝑹𝑬 — Backend Server
===============================
التشغيل محلياً:        python server.py  -> http://localhost:8000
لوحة التحكم:           http://localhost:8000/admin

النشر على Render مجاناً:
  1) اربط الريبو بمشروع Render (Web Service - Python)
  2) build:  pip install -r requirements.txt
  3) start:  python server.py
  4) أضف متغير بيئة MONGODB_URI (رابط MongoDB Atlas) عشان البيانات تفضل محفوظة
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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
PORT = int(os.environ.get('PORT', 8000))

MONGODB_URI = os.environ.get('MONGODB_URI', '')
DB_NAME = os.environ.get('DB_NAME', 'darkstore')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# كلمات مرور الجلسات الصالحة
TOKENS = set()

# ---------- MongoDB (اختياري - قاعدة بيانات سحابية مجانية) ----------
try:
    import pymongo
    from pymongo.server_api import ServerApi
except ImportError:
    pymongo = None

_mongo_client = None


def db_enabled():
    return pymongo is not None and bool(MONGODB_URI)


def mongo_client():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = pymongo.MongoClient(MONGODB_URI, server_api=ServerApi('1'))
    return _mongo_client


def mongo_coll(name):
    return mongo_client()[DB_NAME][name]


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


def load_products_file():
    try:
        with open(os.path.join(DATA_DIR, 'products.json'), 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_products_file(data):
    save_json('products.json', data)


# ---------- طبقة البيانات (MongoDB أو ملفات محلية) ----------
def orders_load():
    if db_enabled():
        try:
            return list(mongo_coll('orders').find({}, {'_id': 0}))
        except Exception:
            pass
    return load_json('orders.json', {"orders": []})['orders']


def orders_save(orders):
    if db_enabled():
        try:
            coll = mongo_coll('orders')
            coll.delete_many({})
            if orders:
                coll.insert_many(orders)
            return
        except Exception:
            pass
    save_json('orders.json', {"orders": orders})


def payments_load():
    if db_enabled():
        try:
            doc = mongo_coll('settings').find_one({'k': 'payments'})
            if doc and doc.get('v'):
                return doc['v']
            return default_payments()
        except Exception:
            pass
    return load_json('payments.json', default_payments())


def payments_save(data):
    if db_enabled():
        try:
            mongo_coll('settings').update_one({'k': 'payments'}, {'$set': {'v': data}}, upsert=True)
            return
        except Exception:
            pass
    save_json('payments.json', data)


def products_load():
    if db_enabled():
        try:
            doc = mongo_coll('settings').find_one({'k': 'products'})
            if doc and doc.get('v'):
                return doc['v']
        except Exception:
            pass
    return load_products_file()


def products_save(games, services):
    current = load_products_file()
    current['games'] = games
    if services is not None:
        current['services'] = services
    save_products_file(current)
    if db_enabled():
        try:
            mongo_coll('settings').update_one({'k': 'products'}, {'$set': {'v': current}}, upsert=True)
        except Exception:
            pass


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
        if path == '/api/products':
            self.send_json(200, products_load())
            return
        if path == '/api/payments':
            self.send_json(200, payments_load())
            return
        if path == '/api/orders':
            if not is_authenticated(self):
                self.send_json(401, {"error": "غير مصرح — سجّل الدخول أولاً"})
                return
            self.send_json(200, {"orders": orders_load()})
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
            orders = orders_load()
            order_id = gen_order_id()
            receipt_path = ''
            img_b64 = payload.get('receiptImage', '')
            if img_b64:
                try:
                    if db_enabled():
                        # في وضع MongoDB نحفظ الإيصال كصورة مضغوطة مباشرة في قاعدة البيانات
                        receipt_path = img_b64
                    else:
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
            orders.insert(0, order)
            orders_save(orders)
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
            products_save(games, services)
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
            payments_save(data)
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
            orders = orders_load()
            for o in orders:
                if o['id'] == order_id:
                    if payload.get('status') in ('pending', 'shipped', 'cancelled'):
                        o['status'] = payload['status']
                        orders_save(orders)
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
            orders = [o for o in orders_load() if o['id'] != order_id]
            orders_save(orders)
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
    load_json('orders.json', {"orders": []})

    print("=" * 50)
    print("  𝑫𝑨𝑹𝑲 𝑺𝑻Ø𝑹𝑬 Backend Server")
    print("=" * 50)
    print(f"  الموقع:      http://localhost:{PORT}")
    print(f"  لوحة التحكم: http://localhost:{PORT}/admin")
    if db_enabled():
        try:
            mongo_client().admin.command('ping')
            print("  MongoDB:     مفعّل ✓ (متصل)")
        except Exception as e:
            print(f"  MongoDB:     فشل الاتصال — سيتم استخدام الملفات المحلية")
            print(f"               ({e})")
    else:
        print("  MongoDB:     غير مفعّل (ملفات محلية)")
    print("=" * 50)
    try:
        with Server(('0.0.0.0', PORT), StoreHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nتم إيقاف الخادم.")


if __name__ == '__main__':
    run()
