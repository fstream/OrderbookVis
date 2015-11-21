'use strict';

module.exports = function (grunt) {

   // Load grunt tasks automatically
   require('load-grunt-tasks')(grunt);

   // Show grunt task time
   require('time-grunt')(grunt);

   // Configurable paths for the src
   var config = {
      src: 'src',
      dist: 'dist'
   };

   // Grunt configuration
   grunt.initConfig({

      // Project settings
      config: config,

      // Bower dependencies
      "bower-install-simple": {
         options: {
            color: true
         },
         "prod": {
            options: {
               production: true
            }
         },
         "dev": {
            options: {
               production: false
            }
         }
      },

      // The grunt server settings
      connect: {
         options: {
            port: 9000,
            hostname: 'localhost',
            livereload: 35729,
            open: {
              target: 'http://localhost:9000/simulator.html'
            }
         },
         livereload: {
            options: {
               middleware: function (connect) {
                  return [
                     connect().use('/bower_components', connect.static('./bower_components')),
                     connect.static('.')
                  ];
               }
            }
         },
         dist: {
            options: {
               base: '.'
            }
         }
      },
      // Compile less to css
      less: {
         development: {
            files: {
               "order-book.css": "src/less/order-book.less"
            }
         }
      },
      // Watch for changes in live edit
      watch: {
         styles: {
            files: ['src/less/**/*.less'],
            tasks: ['less'],
            options: {
               nospawn: true,
               livereload: '<%= connect.options.livereload %>'
            },
         },
         js: {
            files: ['src/js/{,*/}*.js'],
            // tasks: ['concat'],
            options: {
               livereload: '<%= connect.options.livereload %>'
            }
         },
         livereload: {
            options: {
               livereload: '<%= connect.options.livereload %>'
            },
            files: [
               'examples/*.html'
            ]
         }
      },
      concat: {
         options: {
            separator: '\n\n',
         },
         dist: {
            src: ['src/js/empyrean.js', 'src/js/order-book.util.js'],
            dest: 'order-book.js',
         }
      }
   });

   grunt.registerTask('live', [
      'connect:livereload',
      'watch'
   ]);

   grunt.registerTask('server', [
      'build',
      'connect:dist:keepalive'
   ]);

   grunt.registerTask('build', [
      'bower-install-simple',
      'less'
      // 'concat'
   ]);

};
