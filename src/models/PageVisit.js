'use strict';
const mongoose = require('mongoose');
const PageVisitSchema = new mongoose.Schema({pageKey:{type:String,required:true,trim:true,maxlength:80,index:true},pageName:{type:String,required:true,trim:true,maxlength:160},path:{type:String,required:true,trim:true,maxlength:300},referrer:{type:String,default:'',trim:true,maxlength:300},visitorId:{type:String,default:'',trim:true,maxlength:80,index:true},visitedAt:{type:Date,default:Date.now,index:true}},{versionKey:false});
PageVisitSchema.index({visitedAt:-1});
module.exports=mongoose.models.PageVisit||mongoose.model('PageVisit',PageVisitSchema);
