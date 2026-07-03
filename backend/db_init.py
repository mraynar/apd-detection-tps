import os
import sys
import bcrypt
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Add parent directory to path so we can import from database
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db, User, Session as DBSession, Violation

# Load environment variables
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[ERROR] DATABASE_URL environment variable is not set. Please check your .env file.")
    sys.exit(1)

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def init_db():
    print(f"Target connection: {DATABASE_URL}")
    
    # Attempt to automatically create the database if it doesn't exist.
    # We parse the database name from the URL, connect to the default 'postgres' database,
    # and execute the CREATE DATABASE command.
    try:
        if "/apd_detection" in DATABASE_URL:
            base_url, db_name = DATABASE_URL.rsplit('/', 1)
            postgres_url = f"{base_url}/postgres"
            
            print(f"Verifying target database '{db_name}' exists via standard connection...")
            temp_engine = create_engine(postgres_url, isolation_level="AUTOCOMMIT")
            with temp_engine.connect() as conn:
                result = conn.execute(text(f"SELECT 1 FROM pg_database WHERE datname='{db_name}'"))
                exists = result.scalar()
                if not exists:
                    print(f"Database '{db_name}' does not exist. Creating database now...")
                    conn.execute(text(f"CREATE DATABASE {db_name}"))
                    print(f"Database '{db_name}' created successfully.")
                else:
                    print(f"Database '{db_name}' already exists.")
            temp_engine.dispose()
    except Exception as e:
        print(f"[INFO] Automatic database verification/creation skipped or failed: {e}")
        print("Continuing initialization directly...")

    # Set up engine for our database and initialize tables
    engine = create_engine(DATABASE_URL)
    
    # Import app or manually bind metadata to create tables
    print("Creating tables if they don't exist...")
    from flask import Flask
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    
    with app.app_context():
        db.create_all()
        print("Tables created successfully.")
        
        # Check and seed admin account
        admin_user = User.query.filter_by(username="admin").first()
        if not admin_user:
            print("Seeding default admin account...")
            admin_user = User(
                username="admin",
                password_hash=hash_password("admin123"),
                role="admin"
            )
            db.session.add(admin_user)
            
        # Check and seed normal user account
        user1 = User.query.filter_by(username="user1").first()
        if not user1:
            print("Seeding default normal user account ('user1')...")
            user1 = User(
                username="user1",
                password_hash=hash_password("user123"),
                role="user"
            )
            db.session.add(user1)
            
        db.session.commit()
        
    print("\n" + "="*80)
    print("⚠️  WARNING: Persistent database initialized with dev-only accounts:")
    print("   - Username: 'admin' | Password: 'admin123' | Role: 'admin'")
    print("   - Username: 'user1' | Password: 'user123' | Role: 'user'")
    print("⚠️  THESE DUMMY CREDENTIALS MUST BE CHANGED BEFORE PRODUCTION DEPLOYMENT.")
    print("="*80 + "\n")

if __name__ == "__main__":
    init_db()
