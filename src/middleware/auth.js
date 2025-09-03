import jwt from 'jsonwebtoken';

const verifyToken = (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ message: 'Yetkisiz erişim - Token gerekli' });
    }
    
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
    req.user = payload;
    next();
  } catch (err) {
    console.error('Token doğrulama hatası:', err);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Geçersiz token' });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token süresi dolmuş' });
    }
    
    return res.status(401).json({ message: 'Token doğrulanamadı' });
  }
};

export default verifyToken;

