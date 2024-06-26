const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const orderSchema = new Schema(
  {
    orderId:{
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    delivery_address: {
      type: String,
      required: true,
    },
    user_name: {
      type: String,
      required: true,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    expected_delivery: {
      type: String,
      required: true,
    },
    status: {
      type: String,
    },
    statusLevel: {
      type: Number,
      default: 0,
    },
    payment: {
      type: String,
      required: true,
    },
    paymentId: {
      type: String,
    },
    couponApplied: {
      discountAmount: {
        type: Number,
      },
      couponName: {
        type: String,
      },
    },
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          default: 1,
        },
        productPrice: {
          type: Number,
          required: true,
        },
        totalPrice: {
          type: Number,
          default: 0,
        },
        status: {
          type: String,
          default: "placed",
        },
        isReturnReq: {
          type: Boolean,
          default: false,
        },
        statusLevel: {
          type: Number,
          default: 0,
        },
        cancellationReason: {
          type: String,
        },
        sizes: [
          {
            type: Number,
          },
        ],
        isRated: {
          type: Boolean,
          default: false,
        },
      },
    ],
    deliveryAddress: {
      name: {
        type: String,
      },
      addressline: {
        type: String,
      },
      city: {
        type: String,
      },
      state: {
        type: String,
      },
      pincode: {
        type: Number,
      },
      phone: {
        type: Number,
      },
    },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);
