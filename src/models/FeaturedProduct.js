import mongoose from 'mongoose';

const featuredProductSchema = new mongoose.Schema(
  {
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product', 
      required: true, 
      unique: true 
    },
    priority: { 
      type: Number, 
      default: 1, 
      min: 1 
    }, // Sıralama için öncelik
    isActive: { 
      type: Boolean, 
      default: true 
    },
    startDate: { 
      type: Date, 
      default: Date.now 
    },
    endDate: { 
      type: Date 
    }, // Opsiyonel bitiş tarihi
    notes: { 
      type: String, 
      default: '' 
    } // Admin notları
  },
  { timestamps: true }
);

export default mongoose.model('FeaturedProduct', featuredProductSchema);
