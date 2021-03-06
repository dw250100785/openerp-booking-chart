openerp.unleashed.module('booking_chart', function(booking, _, Backbone, base){
    
    var Period = base.models('Period');
    
    var Group = base.collections('Group'),
        _super = Group.prototype;

    var Overlap = Group.extend({

        // redefine to customize Group Collection generated by Overlap (use Overlap Collection by default)
        collection_group: null,

        initialize: function(models, options){
            
            //use option from the main model to create group models, see "createOverlap"
            this.baseOptions = _.clone(options);                
            
            this.options = _.extend({
                attr_date_start: '',
                attr_date_end: '',
                attr_group_by: ''
            }, options);
            
            this.data = _.extend({
                period: new Period()
            }, this.data || {});
            
            this.addModelValidator();
            
            _super.initialize.apply(this, [models, this.options]);
        },
        
        group_by: function(model){
            return this.uid();
        },
        
        /*
         * Get groups aggregated by  with the group_by attribute
         */
        eachAggregatedGroups: function(callback, context){
        	return _.chain(this.groups()).groupBy(this.options.attr_group_by)
        				   			     .each(callback, context);
        },
        
        
        /*
         * add specific validation step for overlapping models
         */
        addModelValidator: function(){
            var _super = this.model.prototype; 
            
            var date_start = this.options.attr_date_start,
                date_end = this.options.attr_date_end,
                group_by = this.options.attr_group_by;
            
            this.model = this.model.extend({
                validate: function(attrs, options){
                    var err = null;
                    
                    if(!(date_start in attrs)){
                        err = new Error('attribute "' + date_start +  '" is not defined');
                    }
                    if(!(date_end in attrs)){
                        err = new Error('attribute "' + date_end +  '" is not defined');
                    }
                    if(!(group_by in attrs)){
                        err = new Error('attribute "' + group_by +  '" is not defined');
                    }
                    
                    var start = moment(attrs[date_start]),
                        end = moment(attrs[date_end]);
                    
                    if(!start.isValid()){
                        err = new Error('start date "' + attrs[date_start] +  '" is not valid');
                    }
                    if(!end.isValid()){
                        err = new Error('end date "' + attrs[date_end] +  '" is not valid');
                    }
                    if(start > end){
                        err = new Error('start date "' + attrs[date_start] +  '" is greater than end date "' + attrs[date_end] +  '"');
                    }
                
                    if(_super.validate){
                        err = _super.validate.apply(this, arguments);
                    }
                    
                    if(err){
                        return err;
                    }
                }    
            });
        },
        
        addToGroup: function(model, index){
            var start = model.get(this.options.attr_date_start),
                end = model.get(this.options.attr_date_end),
                model_period = new Period({start: moment(start), end: moment(end)}),
                group_by = model.get(this.options.attr_group_by),
                existingOverlap = [],
                overlap = null,
                groups = this.groups();
            
            _.each(groups, function(group){
                if(
                    group[this.options.attr_group_by] == group_by 
                    && (
                        ( group.inPeriod(start) || group.inPeriod(end) )
                        || 
                        (
                            group.period().isValid() 
                            && ( model_period.has(group.period().start()) || model_period.has(group.period().end()) )
                        )
                    )
                ){
                    existingOverlap.push(group);
                }    
            }, this);
            
            if(existingOverlap.length > 1){
                // merge all overlap together
                overlap = this.merge(existingOverlap);
            }
            else {
                overlap = existingOverlap.length > 0 ? existingOverlap[0] : this.createOverlap(index);
            }
        
            overlap[this.options.attr_group_by] = group_by;
            groups[overlap.options.index] = overlap;
            groups[overlap.options.index].add(model, {group: false});
            
            this.max = overlap.length > this.max 
            		 ? overlap.length : this.max;
        },
        
        
        merge: function(groups){
            var overlap = this.createOverlap(this.uid());
            
            _.each(groups, function(group){
                overlap.add(group.models, {group: false, updatePeriod: false});
                this.removeGroup(group.options.index);    
            }, this);
        
            return overlap.updatePeriod();
        },
        
        reviewOverlap: function(){
            if(this.isGroup()){
                var groups = this.options.parent.groups(),
                    new_groups = [],
                    start = this.period().start(), 
                    attr_start = this.options.attr_date_start,
                    attr_end = this.options.attr_date_end,
                    attr_group_by = this.options.attr_group_by,
                    sorted = this.sortBy(function(model){ 
                        return moment(model.get(attr_start)).diff(start, 'days'); 
                    }),
                    previous_end = null;
                
                _.each(sorted, function(model){
                    var model_start = moment(model.get(attr_start)),
                        model_end = moment(model.get(attr_end));
                        
                    if(previous_end && previous_end < model_start){
                        this.remove(model, {group: false, updateOverlap: false});
                        var uid = this.uid();
                        new_groups.push(groups[uid] = this.createOverlap(uid));
                        groups[uid][attr_group_by] = this[attr_group_by];
                        groups[uid].add(model, {group: false, updatePeriod: false});
                    }
                    
                    previous_end = !previous_end || previous_end < model_end ? model_end : previous_end;
                }, this);
                
                _.each(new_groups, function(group){
                    group.updatePeriod();
                });
                
                if(this.length <= 0){
                    this.options.parent.removeGroup(this.options.index);
                }
                else {
                    this.updatePeriod();
                }    
            }
        },


        getGroupConstructor: function(){
            return this.collection_group || Overlap;
        },
        
        createOverlap: function(index){
            var GroupConstructor = this.getGroupConstructor();
            return new GroupConstructor([], _.extend({ 
                attr_date_start: this.options.attr_date_start,
                attr_date_end: this.options.attr_date_end,
                attr_group_by: this.options.attr_group_by,   
                group_by: this.group_by, 
                grouped: true, 
                parent: this, 
                index: index,
            }, this.baseOptions));
        },
        
        uid: function(){
            return Math.random().toString(36).substr(2, 12);
        },
        
        inPeriod: function(date){
            return this.period().has(moment(date));    
        },
        
        period: function(period){
            if(period){
                this.data.period = period;
            }
            return this.data.period;
        },
        
        updatePeriod: function(){
            var start = null,
                end = null,
                period_start = null,
                period_end = null,
                attr_start = this.options.attr_date_start,
                attr_end = this.options.attr_date_end;
                
            this.each(function(model){
                start = moment(model.get(attr_start));
                end =  moment(model.get(attr_end));
                period_start = !period_start || period_start > start ? start : period_start;
                period_end = !period_end || period_end < end ? end : period_end;  
            });
            
            this.period().set({
                start: period_start,
                end: period_end
            });
            
            return this;
        },
        
        set: function(models, options){
            options = _.extend({
                updatePeriod: true,
                validate:true
            }, options);
            
            _super.set.apply(this, arguments);
            
            if(options.updatePeriod){
                this.updatePeriod();    
            }
        },
        
        remove: function(models, options){
            options = _.extend({
                group: true,
                updateOverlap: true
            }, options);
            
            var before = this.length;
            _super.remove.apply(this, arguments);
            
            if(this.isGroup() && this.length < before && options.updateOverlap){
                this.reviewOverlap();   
            }    
        },
    
    });

    booking.collections('Overlap', Overlap);

});