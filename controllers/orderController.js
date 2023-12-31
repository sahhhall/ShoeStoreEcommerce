const User = require('../models/userModel');
const userOtpVerification = require('../models/userOTPverification')
const Category = require('../models/categoriesModel')
const Token = require('../models/tokenModel');
const crypto = require("crypto");
const bcrypt = require('bcrypt')
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const Product = require('../models/productSchema');
const Order = require('../models/orderSchema');
const Cart = require('../models/cartSchema')
const Razorpay = require("razorpay");
dotenv.config();


// ================================RAZORPAY INSTANCE========================================

var instance = new Razorpay({key_id: process.env.RazorId, key_secret: process.env.RazorKey});


// ===============================ORDER PLACING ================================//
const placeOrder = async (req, res) => {

    try {

        const userId = req.session.user._id;
        const {selectedAddress, selectedShippingMethod, subTotalValue} = req.body;
        const cartData = await Cart.findOne({userid: userId});
        const cartProducts = cartData.products;
        console.log(cartProducts);
        const total = subTotalValue;
        const userData = await User.findOne({_id: userId});
        const name = userData.name;
        console.log(name, selectedShippingMethod);

        const status = selectedShippingMethod === "COD" ? "placed" : "pending";
        const statusLevel = status === "placed" ? 1 : 0;
        const date = new Date();

        const delivery = new Date(date.getTime() + 10 * 24 * 60 * 60 * 1000);
        const deliveryDate = delivery.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        }).replace(/\//g, '-');

        const newOrder = new Order({
            userId: userId,
            delivery_address: selectedAddress,
            user_name: name,
            total_amount: subTotalValue,
            date: date,
            status: status,
            statusLevel: statusLevel,
            expected_delivery: deliveryDate,
            payment: selectedShippingMethod,
            products: cartProducts
        });


        let orderDetailsData = await newOrder.save();
        const orderId = orderDetailsData._id;

        if (orderDetailsData) { // cash on delivery

            if (orderDetailsData.status === "placed") {

                await Cart.deleteOne({userid: userId});
                for (let i = 0; i < cartData.products.length; i++) {
                    const productId = cartProducts[i].productId;
                    const count = cartProducts[i].quantity;

                    await Product.updateOne({
                        _id: productId
                    }, {
                        $inc: {
                            stockQuantity: - count
                        }
                    });
                }
                res.json({success: true, params: orderId});

            } else { // order not cod
                const orderId = orderDetailsData._id;
                const totalAmount = orderDetailsData.total_amount;
                console.log("both of two ", orderId, totalAmount)


                if (orderDetailsData.payment == "onlinePayment") {
                    var options = {
                        amount: totalAmount * 100,
                        currency: "INR",
                        receipt: "" + orderId, // /we want here objectid t o strung
                    };
                    console.log(options.amount)
                    instance.orders.create(options, function (err, order) {
                        console.log("here i syourt oerdaer", order)
                        res.json({success: false, order});
                    });
                }else if(orderDetailsData.payment == "wallet" ){

                    await Cart.deleteOne({userid: userId});
                    for (let i = 0; i < cartData.products.length; i++) {
                        const productId = cartProducts[i].productId;
                        const count = cartProducts[i].quantity;
                        
                        await Product.updateOne({
                            _id: productId
                        }, {
                            $inc: {
                                stockQuantity: - count,
                             
                            },
                          
                        });
                    }

                    
                    await Order.updateOne(
                        {
                        
                            _id: orderId 
                        },
                        {
                            $set: {
                                status: "placed",
                                statusLevel: 1
                            }
                        }
                    );
                    // here i updateing the wallet balance
                    await User.updateOne({
                        _id:userId
                    },{
                        $inc:{
                            wallet : -totalAmount,
                            
                        },
                        $push:{
                            walletHistory:{
                                date: new Date(),
                                amount: `-${totalAmount}`,
                                reason: 'ordered with wallet'
                            }
                        }
                        
                    })
                    res.json({success: true, params: orderId});
                }


            }
        }


    } catch (err) {

        console.log(err.message)
    }
}

const paymentVerfication = async (req, res) => {
    try {
        const cartData = await Cart.findOne({userid: req.session.user._id});
        const products = cartData.products;
        const details = req.body;
        console.log("hey am here", details);
        const hmac = crypto.createHmac("sha256", process.env.RazorKey);
        hmac.update(details.payment.razorpay_order_id + "|" + details.payment.razorpay_payment_id);
        const hmacValue = hmac.digest("hex");
        if (hmacValue === details.payment.razorpay_signature) {
            for (let i = 0; i < cartData.products.length; i++) {
                const productId = products[i].productId;
                const count = products[i].quantity;

                await Product.updateOne({
                    _id: productId
                }, {
                    $inc: {
                        stockQuantity: - count
                    }
                });
            }
            console.log("how", details.order.receipt)
            await Order.findByIdAndUpdate({
                _id: details.order.receipt
            }, {
                $set: {
                    status: "placed",
                    statusLevel: 1
                }
            });

            await Order.findByIdAndUpdate({
                _id: details.order.receipt
            }, {
                $set: {
                    paymentId: details.payment.razorpay_payment_id
                }
            });
            await Cart.deleteOne({userId: req.session.user._id});
            const orderid = details.order.receipt;
            console.log("how?")

            res.json({codsuccess: true, orderid});

        } else {
            await Order.findByIdAndRemove({_id: details.order.receipt});
            res.json({success: false});
        }
    } catch (err) {
        console.log(err.message)
    }
}


// =============================== SUCCESS PAGE ================================//
const loadSuccess = async (req, res) => {
    try {
        res.render('successOrder');
    } catch (err) {
        console.log(err.message)
    }
}


// ===============================Order page loading for user side=================================//

const loadOrder = async (req, res) => {
    try {
        

        let page = 1;
        // if in query page we've to set 
        if(req.query.page){
            page = req.query.page
        }
        let limit = 3;
        let previous = (page>1) ? page - 1 : 1;
        let next = page + 1;

        const sortOption = req.query.sortbyorder;
        console.log("hi ame", sortOption);
        const userId = req.session.user._id;
        console.log(userId, "its myyyy");
        // this is not thath url query 
        let query = {userId: userId, status: 'placed'};
     
        if(sortOption === 'defaultbyplaced' ){
                query.status = 'placed'
        }else if( sortOption === 'Shipped' ){
            query.status = 'shipped'
        }
        else if( sortOption === 'Delivered' ){
            query.status = 'delivered'
        }
        else if( sortOption === 'cancelled' ){
                query.status = 'cancelled'
        }
        else if( sortOption === 'pending' ){
            query.status = 'pending';
        }
        else if(  sortOption === 'return' ){
            query.status ={ $in: ['Return Requested', 'returned'] };
        }

        const orders = await Order.find(query).populate('products.productId').sort({date: -1}).limit(limit)
        .skip((page - 1) * limit)
        .exec();

        const count  = await Order.countDocuments(query);

        const totalPages = Math.ceil(count / limit);

        if(next > totalPages){
            next = totalPages
        }


        console.log("here my all orders", orders);
        // Extract product details from orders
        const orderData = orders.map(order => ({
            _id: order._id,
            user_name: order.user_name,
            date: new Date(order.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',

                hour12: true
            }),
            total_amount: order.total_amount,
            payment: order.payment,
            status: order.status,
            statusLevel: order.statusLevel,
            expected_delivery: order.expected_delivery,
            products: order.products.map(product => ({productId: product.productId, proquantity: product.quantity}))
        }));

        res.render('ordersUserPage', {
            orderData,
            totalPages:totalPages,
            next: next,
            previous: previous,
            currentPage : page,
            sortOption : sortOption   //this foe i set pafination if paginartion press this should checl
        });

    } catch (err) {
        console.error(err.message);
        // Handle the error appropriately, for example, sending an error response.

    }
};

const userOderDetails = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const id = req.query.id;
        const orderedProduct = await Order.findOne({_id: id}).populate("products.productId");


        // Extract the delivery address ObjectId
        const addressId = orderedProduct.delivery_address;
        const user = await User.findOne({"addresses._id": addressId});
        const selectedAddress = user.addresses.find(address => address._id.equals(addressId));


        // Define arrays for day and month names
        const daysOfWeek = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday'
        ];
        const monthsOfYear = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December'
        ];
        const currentDate = new Date();
        const day = daysOfWeek[currentDate.getDay()];
        const month = monthsOfYear[currentDate.getMonth()];
        const year = currentDate.getFullYear();
        const formattedDate = day + ', ' + month + ' ' + currentDate.getDate() + ', ' + year;

        console.log(orderedProduct);
        res.render("orderFullDetails", {
            orders: orderedProduct,
            selectedAddress: selectedAddress,
            formattedDate: formattedDate
        });
    } catch (err) {
        console.log(err.message);
    }
};


// =================================SHOW ORDERS LIST IN ADMIN SIDE==================================================//
const loadOrderlist = async (req, res) => {
    try {
        const ordersData = await Order.find().populate("products.productId").sort({date: -1});

        res.render('orderPage', {orders: ordersData})
    } catch (err) {
        console.log(err.message)
    }
}

const statusUpdate = async (req, res) => {
    try {
        const orderId = req.query.id;
        const orderData = await Order.findOne({_id: orderId});
        const userId = orderData.userId
        const statusLevel = req.query.status;
        const amount = orderData.total_amount;
        const products = orderData.products;

        if (statusLevel === '0') {
            await Order.updateOne({
                _id: orderId
            }, {
                $set: {
                    status: "cancelled",
                    statusLevel: 0
                }
            });
            for (let i = 0; i < products.length; i++) {
                let pro = products[i].productId;
                let count = products[i].quantity;
                await Product.findOneAndUpdate({
                    _id: pro
                }, {
                    $inc: {
                        stockQuantity: count
                    }
                });
            }
        } else if (statusLevel === '2') {
            await Order.updateOne({
                _id: orderId
            }, {
                $set: {
                    status: "shipped",
                    statusLevel: 2
                }
            })
        } else if (statusLevel === '3') {
            await Order.updateOne({
                _id: orderId
            }, {
                $set: {
                    status: "delivered",
                    deliveryDate: new Date(),
                    statusLevel: 3
                }
            });
        }
        res.redirect("/admin/orders");
    } catch (err) {
        console.log(err.message)
    }
}


const cancelOrder = async (req, res) => {
    try {
        const {orderId} = req.body;
        const orderData = await Order.findOne({_id: orderId});
        const products = orderData.products;

        // console.log("am hereee guys")
        await Order.updateOne({
            _id: orderId
        }, {
            $set: {
                status: "cancelled",
                statusLevel: 0
            }
        });
        for (let i = 0; i < products.length; i++) {
            let pro = products[i].productId;
            let count = products[i].quantity;
            await Product.findOneAndUpdate({
                _id: pro
            }, {
                $inc: {
                    stockQuantity: count
                }
            });
        }
        res.json({cancelled: true});
    } catch (err) {
        console.log(err.message)
    }
}


const returnReason = async (req, res) => {
    try {
        const {reason, orderid} = req.body;
        await Order.findByIdAndUpdate({
            _id: orderid
        }, {
            $set: {
                cancellationReason: reason,
                status: "Return Requested",
                statusLevel: 4
            }
        });
        res.json({reason: true});
    } catch (err) {
        console.log(err)
    }
}

// return reason check rej and acc

const returnConf = async (req, res) => {
    try {
        
        console.log("I am here for confirmation");
        const {orderId, btndata} = req.body;
        const orderDet = await Order.findOne({_id: orderId});
        const products = orderDet.products;
        const userId = orderDet.userId;
        
      
          let totalamountTowallet =   orderDet.total_amount;
        if (btndata == "accept") {

            await Order.updateOne({
                _id: orderId
            }, {
                $set: {
                    status: "returned",
                    statusLevel: 5
                }
            })
            for (let i = 0; i < products.length; i++) {
                let pro = products[i].productId;
                let count = products[i].quantity;
                await Product.findOneAndUpdate({
                    _id: pro
                }, {
                    $inc: {
                        stockQuantity: count
                    }
                });
            }
             
            await User.findOneAndUpdate({
                _id:userId
            },{
                $inc:{
                    wallet: totalamountTowallet
                },
                $push:{
                    walletHistory:{
                        date: new Date(),
                        amount: totalamountTowallet,
                        reason: 'order return'
                    }
                }

            })
        
           
        } else if (btndata == "reject") {

            await Order.updateOne({
                _id: orderId
            }, {
                $set: {
                    status: "delivered",

                    statusLevel: 3
                }
            })
        }

        res.json({isOK: true});
    } catch (err) {
        console.log(err.message);
    }
};

const orderDetailedview = async (req, res) => {
    try {
        const orderId = req.query.id;


        const ordersData = await Order.findOne({_id: orderId}).populate("products.productId");
        const userId = ordersData.userId;
        console.log("here all data ", ordersData)
        // Extract the delivery address ObjectId
        const addressId = ordersData.delivery_address;

        // here am doing get first documetn in array of address
        const userAddresses = await User.findOne({
            "addresses": {
                $exists: true,
                $ne: {}
            }
        }, {"addresses": 1});
        const userFirstadd = userAddresses.addresses[0];

        const userad = await User.findOne({"addresses._id": addressId});

        const selectedAddress = userad.addresses.find(address => address._id.equals(addressId));


        const userData = await User.findById(userId);

        res.render('orderDetail', {
            orders: ordersData,
            user: userData,
            selectedAddress: selectedAddress,
            userFirstadd: userFirstadd
        });
    } catch (err) {
        console.log(err.message)
    }
}

module.exports = {
    placeOrder,
    paymentVerfication,
    loadSuccess,
    loadOrderlist,
    loadOrder,
    userOderDetails,
    statusUpdate,
    cancelOrder,
    returnReason,
    returnConf,
    orderDetailedview
}
