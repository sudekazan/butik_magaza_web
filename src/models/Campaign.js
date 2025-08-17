import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    description: { 
      type: String, 
      default: '' 
    },
    startDate: { 
      type: Date, 
      required: true 
    },
    endDate: { 
      type: Date, 
      required: true 
    },
    type: { 
      type: String, 
      enum: ['category', 'products'], 
      required: true 
    },
    targetId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Category',
      required: function() { return this.type === 'category'; }
    },
    productIds: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product' 
    }],
    discount: { 
      type: Number, 
      min: 0, 
      max: 100, 
      default: 0 
    },
    imageUrl: { 
      type: String, 
      default: '' 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    priority: { 
      type: Number, 
      default: 1 
    }
  },
  { timestamps: true }
);

// Kampanya bitiş tarihi geldiğinde otomatik pasif yap
campaignSchema.pre('save', function(next) {
  if (this.endDate && new Date() > this.endDate) {
    this.isActive = false;
  }
  next();
});

// Kampanya durumunu kontrol eden statik metod
campaignSchema.statics.updateExpiredCampaigns = async function() {
  const now = new Date();
  const result = await this.updateMany(
    { 
      endDate: { $lt: now }, 
      isActive: true 
    },
    { 
      $set: { isActive: false } 
    }
  );
  return result;
};

// Kampanya bitiş tarihi kontrolü için index
campaignSchema.index({ endDate: 1, isActive: 1 });

export default mongoose.model('Campaign', campaignSchema);
